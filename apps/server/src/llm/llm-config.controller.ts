import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { CreateLlmConfigDto, TestLlmConfigDto, UpdateLlmConfigDto } from './dto/llm-config.dto';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { AuditService } from '../audit/audit.service';

@Controller('llm-config')
export class LlmConfigController {
  constructor(
    private readonly configs: ModelConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.configs.listPublic(user.tenantId);
  }

  @Roles('ADMIN')
  @Post('test')
  test(@CurrentUser() user: AuthUser, @Body() dto: TestLlmConfigDto) {
    return this.configs.test(user.tenantId, dto);
  }

  @Roles('ADMIN')
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateLlmConfigDto) {
    const result = await this.configs.create(user.tenantId, dto, user.sub);
    await this.audit.log(user.tenantId, user, 'llm-config.create', 'llm_config', result.id ?? undefined, {
      name: result.name,
      provider: result.provider,
      model: result.model,
      isDefault: result.isDefault,
    });
    return result;
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.configs.getPublicById(user.tenantId, id);
  }

  @Roles('ADMIN')
  @Put(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLlmConfigDto) {
    const result = await this.configs.update(user.tenantId, id, dto, user.sub);
    await this.audit.log(user.tenantId, user, 'llm-config.update', 'llm_config', id, {
      provider: result.provider,
      baseUrl: result.baseUrl,
      model: result.model,
      apiKeyChanged: dto.apiKey !== undefined,
    });
    return result;
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.configs.remove(user.tenantId, id);
    await this.audit.log(user.tenantId, user, 'llm-config.delete', 'llm_config', id, {});
    return { ok: true };
  }

  @Roles('ADMIN')
  @Post(':id/default')
  async setDefault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const result = await this.configs.setDefault(user.tenantId, id, user.sub);
    await this.audit.log(user.tenantId, user, 'llm-config.set-default', 'llm_config', id, {
      name: result.name,
    });
    return result;
  }
}
