import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rule } from './rule.entity';
import { RuleTemplate } from './rule-template.entity';
import { RuleVersion, RuleLock } from './rule-version.entity';
import { RulesService } from './rules.service';
import { RulesController, RuleBatchVersionsController } from './rules.controller';
import { RuleTemplatesService } from './rule-templates.service';
import { RuleTemplatesController } from './rule-templates.controller';
import { RuleVersionsService } from './rule-versions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Rule, RuleTemplate, RuleVersion, RuleLock])],
  providers: [RulesService, RuleTemplatesService, RuleVersionsService],
  controllers: [RulesController, RuleTemplatesController, RuleBatchVersionsController],
  exports: [RulesService, RuleTemplatesService, RuleVersionsService],
})
export class RulesModule {}
