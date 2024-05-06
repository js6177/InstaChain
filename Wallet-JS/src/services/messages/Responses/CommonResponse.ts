/*
This class contains the fields that are common to all responses. 
 */

interface CommonResponse {
    error_code: number;
    error_message: string;
}

export default CommonResponse;