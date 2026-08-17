import { PartialType } from '@nestjs/swagger';
import { CreateVideoTutorialDto } from './create-video-tutorial.dto';

export class UpdateVideoTutorialDto extends PartialType(CreateVideoTutorialDto) {}
