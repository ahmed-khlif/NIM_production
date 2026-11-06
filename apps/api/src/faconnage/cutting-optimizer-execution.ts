import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { Injectable } from "@nestjs/common";
import type { ProfileOptimizationInput, ProfileOptimizationResult } from "./faconnage.types";
import { RawStockLimitError } from "./faconnage.types";

const workerSource = `
const { parentPort, workerData } = require("node:worker_threads");
const { CuttingOptimizer } = require(workerData.optimizerPath);
const optimizer = new CuttingOptimizer();
parentPort.once("message", async ({ profiles }) => {
  try {
    const results = await Promise.all(profiles.map((profile) => optimizer.optimize(profile)));
    parentPort.postMessage({ results });
  } catch (error) {
    parentPort.postMessage({
      error: {
        name: error && error.name,
        message: error instanceof Error ? error.message : String(error),
        profile: error && error.profile,
      },
    });
  }
});
`;
const apiRequire = createRequire(join(__dirname, "../../package.json"));

type WorkerResponse =
  | { results: ProfileOptimizationResult[] }
  | { error: { name?: string; message: string; profile?: string } };

@Injectable()
export class CuttingOptimizerExecution {
  private readonly maxWorkers = Math.max(1, Math.min(2, availableParallelism() - 1));
  private activeWorkers = 0;
  private readonly waiters: Array<() => void> = [];

  async optimize(profiles: ProfileOptimizationInput[]): Promise<ProfileOptimizationResult[]> {
    if (profiles.length === 0) return [];
    await this.acquireWorkerSlot();
    try {
      return await this.runWorker(profiles);
    } finally {
      this.releaseWorkerSlot();
    }
  }

  private async acquireWorkerSlot(): Promise<void> {
    if (this.activeWorkers >= this.maxWorkers) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.activeWorkers += 1;
  }

  private releaseWorkerSlot(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.activeWorkers -= 1;
  }

  private runWorker(profiles: ProfileOptimizationInput[]): Promise<ProfileOptimizationResult[]> {
    const compiledOptimizerPath = join(__dirname, "cutting-optimizer.js");
    const optimizerPath = existsSync(compiledOptimizerPath)
      ? compiledOptimizerPath
      : join(__dirname, "cutting-optimizer.ts");
    const isTypeScript = optimizerPath.endsWith(".ts");
    const execArgv = isTypeScript ? ["-r", apiRequire.resolve("tsx/cjs")] : [];
    const worker = new Worker(workerSource, {
      eval: true,
      execArgv,
      workerData: { optimizerPath },
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        finish(() => reject(new Error("Le calcul de façonnage a dépassé le délai maximal.")));
      }, 120_000);
      timeout.unref();

      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void worker.terminate();
        callback();
      };

      worker.once("message", (response: WorkerResponse) => {
        if ("error" in response) {
          finish(() => {
            if (response.error.name === "RawStockLimitError" && response.error.profile) {
              reject(new RawStockLimitError(response.error.profile));
              return;
            }
            const error = new Error(response.error.message);
            error.name = response.error.name ?? "Error";
            reject(error);
          });
          return;
        }
        finish(() => resolve(response.results));
      });
      worker.once("error", (error) => finish(() => reject(error)));
      worker.once("exit", (code) => {
        if (code !== 0) finish(() => reject(new Error(`Le worker de façonnage s’est arrêté (${code}).`)));
      });
      worker.postMessage({ profiles });
    });
  }
}
