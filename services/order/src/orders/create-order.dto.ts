import { IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, Min } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  readonly productId: string;

  @IsInt()
  @Min(1)
  readonly quantity: number;

  @IsNumber()
  @IsPositive()
  readonly amount: number;
}
