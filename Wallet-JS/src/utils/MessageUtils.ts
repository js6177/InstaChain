import CommonResponse from "../services/messages/Responses/CommonResponse";

export function IsSuccessResponse(response: CommonResponse): boolean {
    return response.error_code === 0;
}