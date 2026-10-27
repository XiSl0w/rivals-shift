export class RivalsDataError extends Error {
    code;
    status;
    details;
    constructor(code, message, options = {}) {
        super(message, { cause: options.cause });
        this.name = "RivalsDataError";
        this.code = code;
        this.status = options.status;
        this.details = options.details;
    }
}
//# sourceMappingURL=errors.js.map