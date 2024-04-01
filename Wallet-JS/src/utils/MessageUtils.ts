import CommonResponse from "../services/messages/CommonResponse";

export function IsSuccessResponse(response: CommonResponse): boolean {
    return response.error_code === 0;
}