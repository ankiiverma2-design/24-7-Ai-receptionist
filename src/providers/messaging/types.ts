export interface Message {
  to: string;
  subject?: string;
  body: string;
}

export interface MessagingProvider {
  readonly name: string;
  sendSms?(msg: Message): Promise<void>;
  sendEmail?(msg: Message): Promise<void>;
}
