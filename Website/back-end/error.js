//Adds a status parameter to tell the server what kind of error it is
//400 - Bad Request
//404 - Not Found
//422 - Unprocessable Content
//500 - Internal Server Error
//502 - Bad Gateway
//504 - Gateway Timeout
export class AppError extends Error{
    constructor(message, status=500){
        super(message);
        this.status = status;
    }
}