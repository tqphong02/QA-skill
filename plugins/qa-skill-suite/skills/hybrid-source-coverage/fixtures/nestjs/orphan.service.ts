import { Inject, Injectable } from "@nestjs/common";

@Injectable()
export class OrphanService {
  constructor(@Inject("EXTERNAL_GATEWAY") private readonly gateway: unknown) {}

  ping(): string {
    return "pong";
  }
}
