import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rule } from './rule.entity';
import { RuleTemplate } from './rule-template.entity';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { RuleTemplatesService } from './rule-templates.service';
import { RuleTemplatesController } from './rule-templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Rule, RuleTemplate])],
  providers: [RulesService, RuleTemplatesService],
  controllers: [RulesController, RuleTemplatesController],
  exports: [RulesService, RuleTemplatesService],
})
export class RulesModule {}
