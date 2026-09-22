export interface EventEnvelope<TPayload> {
  eventId: string;
  type: string;
  version: number;
  occurredAt: string;
  payload: TPayload;
}
