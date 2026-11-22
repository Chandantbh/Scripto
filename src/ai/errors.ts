export class AIInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIInputError';
  }
}
