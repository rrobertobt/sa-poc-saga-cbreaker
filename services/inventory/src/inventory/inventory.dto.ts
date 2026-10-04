import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class ReserveDto {
  @IsString()
  @IsNotEmpty()
  readonly orderId: string;

  @IsString()
  @IsNotEmpty()
  readonly productId: string;

  @IsInt()
  @Min(1)
  readonly quantity: number;
}

/** Released by `reservationId` or, if unknown, by `orderId`. */
export class ReleaseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  readonly reservationId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  readonly orderId?: string;
}
