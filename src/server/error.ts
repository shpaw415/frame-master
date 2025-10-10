

export class FrameMasterError extends Error {
    constructor(message: string, cause?: Error) {
        super(message);
        this.name = "FrameMasterError";
        this.cause = cause;
    }
}