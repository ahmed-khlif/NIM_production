import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { RealtimeEvent } from "@nim/types";
import { AuthService } from "../auth/auth.service";
import type { AuthContext } from "../auth/auth.types";
import { RealtimeService } from "./realtime.service";

type AuthenticatedSocket = Socket & { data: { auth?: AuthContext } };

@Injectable()
@WebSocketGateway({ namespace: "/realtime", cors: { origin: process.env.APP_URL ?? "http://localhost:3000", credentials: true } })
export class RealtimeGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  private server!: Server;

  private unsubscribe: (() => void) | undefined;

  constructor(@Inject(RealtimeService) private readonly realtime: RealtimeService, @Inject(AuthService) private readonly auth: AuthService) {}

  onModuleInit(): void {
    this.unsubscribe = this.realtime.subscribe((event) => this.broadcast(event));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  handleConnection(client: AuthenticatedSocket): void {
    void this.authenticate(client);
  }

  private async authenticate(client: AuthenticatedSocket): Promise<void> {
    const token = this.auth.readSessionCookie(client.handshake.headers.cookie);
    const auth = token ? await this.auth.validateSession(token) : null;
    if (!auth) {
      client.disconnect(true);
      return;
    }
    client.data.auth = auth;
    client.emit("realtime:connected", { userId: auth.user.id });
  }

  private broadcast(event: RealtimeEvent): void {
    if (!this.server?.sockets?.sockets) return;
    for (const client of this.server.sockets.sockets.values()) {
      if (client.data.auth) client.emit("realtime:event", event);
    }
  }
}
