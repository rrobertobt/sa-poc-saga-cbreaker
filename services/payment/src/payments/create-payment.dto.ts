import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  readonly orderId: string;

  @IsNumber()
  @IsPositive()
  readonly amount: number;
}
