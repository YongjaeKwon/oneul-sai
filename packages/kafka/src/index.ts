export interface KafkaConnectionConfig {
  brokers: string[];
  clientId: string;
}

export function buildTopicName(
  domain: string,
  event: string,
  version: number,
): string {
  return `${domain}.${event}.v${version}`;
}

export type TopicName = ReturnType<typeof buildTopicName>;
