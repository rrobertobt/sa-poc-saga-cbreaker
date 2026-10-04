import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ScheduleShipmentDto {
  @IsString()
  @IsNotEmpty()
  readonly orderId: string;

  @IsOptional()
  @IsString()
  readonly address?: string;
}
