import { IsOptional, IsString } from 'class-validator'

export class UploadBase64Dto {
    @IsString()
    base64: string

    @IsOptional()
    @IsString()
    fileName?: string

    @IsOptional()
    @IsString()
    contentType?: string
}

export class GetImageByUrlDto {
    @IsString()
    url: string
}

