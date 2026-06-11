# Event Rule Engine - 多租户事件驱动规则引擎与告警编排平台

面向运维监控的多租户事件驱动规则引擎与告警编排平台，支持从多种事件源接收监控数据，通过灵活的规则匹配触发告警，并按编排策略分发到不同通知渠道。

## 功能特性

### 事件接入
- **Webhook推送**: 每个租户独立的接入URL和密钥验证，支持HTTP POST JSON格式事件
- **内置Agent**: 轻量采集探针配置页面，支持CPU/内存/磁盘/网络指标采集
- **Prometheus AlertManager兼容**: 接收AlertManager格式的告警推送(firing/resolved状态)

### 规则引擎
- **单指标阈值**: 如 `cpu_usage > 80`
- **多指标组合**: 如 `cpu > 80 AND memory > 90`
- **时间窗口聚合**: 如 `5分钟内错误数 > 10` (滑动窗口)
- **频率条件**: 如 `同一事件1小时内出现超过5次`
- **标签匹配**: 如 `host标签包含"prod"`
- **序列模式**: 如 `事件A发生后30秒内事件B也发生`
- **两种编辑模式**: 可视化表单 + 文本DSL (类SQL语法)
- **规则热更新**: 创建/修改/删除即时生效

### 告警生命周期
- **状态机**: 待确认→已确认→处理中→已解决
- **自动升级**: 未确认告警超过30分钟自动升级，已确认后2小时未处理再次升级
- **去重与聚合**: 相同标签集的告警在5分钟内只产生一条，使用SHA256 fingerprint
- **静默规则**: 维护窗口期间静默特定主机告警
- **抑制规则**: 高优先级告警存在时自动抑制低优先级告警

### 通知渠道
- **支持渠道**: 邮件、Slack、企业微信、自定义Webhook
- **模板配置**: 支持变量占位符 `{{alert_name}}`, `{{severity}}`, `{{labels.host}}`, `{{value}}`
- **路由策略**: 不同严重程度路由到不同渠道
- **重试机制**: 失败时重试3次 (间隔1分钟/5分钟/15分钟)
- **死信队列**: 重试失败记录到死信队列

### 值班排班
- **固定排班**: 周一到周五白班/夜班
- **轮转排班**: 每周自动轮换
- **节假日覆盖**: 指定日期特定人值班
- **升级链**: 一线30分钟未响应→通知二线→60分钟未响应→通知主管

### 多租户隔离
- 租户间数据完全隔离
- 租户级配额: 最大规则数、最大事件吞吐、最大活跃告警数
- 独立的Webhook URL和密钥

### Dashboard
- 当前活跃告警列表 (按严重程度排序)
- 历史告警时间线
- 规则命中统计 (每条规则触发次数趋势)
- MTTA (平均确认时间) / MTTR (平均解决时间)
- 各渠道通知发送量
- 支持按时间范围/标签/严重程度/状态过滤

## 技术栈

### 后端
- **框架**: NestJS 10 (Node.js 20)
- **数据库**: PostgreSQL 16
- **缓存/队列**: Redis 7
- **ORM**: TypeORM
- **任务调度**: NestJS Schedule

### 前端
- **框架**: Vue 3 + TypeScript
- **UI组件**: Element Plus
- **图表**: ECharts
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **构建工具**: Vite 5

### 部署
- **容器化**: Docker + docker-compose
- **反向代理**: Nginx (前端静态托管 + API反代)

## 快速开始

### 1. 环境准备
```bash
# 复制环境变量文件
cp .env.example .env

# 修改配置
vim .env
```

### 2. 启动服务
```bash
# 构建并启动所有服务
docker-compose up -d --build

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f backend
```

### 3. 访问应用
- 前端: http://localhost:8080
- API文档: http://localhost:3000/api/docs
- 默认账号: admin / password

### 4. 发送测试事件
```bash
# Webhook事件 (使用默认租户的API Key)
curl -X POST http://localhost:3000/webhook/default-api-key-123 \
  -H "Content-Type: application/json" \
  -d '{
    "source": "test",
    "labels": {
      "host": "server-01",
      "service": "api"
    },
    "metricName": "cpu_usage",
    "value": 85,
    "severity": "warning"
  }'
```

## 项目结构

```
event-rule/
├── backend/                    # 后端NestJS应用
│   ├── src/
│   │   ├── alerts/             # 告警模块
│   │   ├── auth/               # 认证模块
│   │   ├── common/             # 公共模块
│   │   ├── dashboard/          # Dashboard模块
│   │   ├── events/             # 事件接入模块
│   │   ├── metrics/            # 指标模块
│   │   ├── notifications/      # 通知模块
│   │   ├── rules/              # 规则引擎模块
│   │   ├── schedules/          # 排班模块
│   │   ├── tenants/            # 租户模块
│   │   ├── users/              # 用户模块
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── database/init/          # 数据库初始化脚本
│   ├── Dockerfile
│   └── package.json
├── frontend/                   # 前端Vue3应用
│   ├── src/
│   │   ├── layouts/            # 布局组件
│   │   ├── views/              # 页面组件
│   │   ├── services/           # API服务
│   │   ├── stores/             # 状态管理
│   │   ├── router/             # 路由配置
│   │   ├── styles/             # 全局样式
│   │   ├── App.vue
│   │   └── main.ts
│   ├── nginx.conf              # Nginx配置
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## API规范

### Webhook接入
```
POST /webhook/{apiKey}
Content-Type: application/json
X-Signature: sha256=xxxxxx (可选)

{
  "source": "custom",
  "timestamp": "2024-01-01T00:00:00Z",
  "labels": {
    "host": "server-01",
    "service": "api"
  },
  "metricName": "cpu_usage",
  "value": 85,
  "severity": "warning",
  "message": "High CPU usage"
}
```

### Prometheus AlertManager
```
POST /webhook/{apiKey}/prometheus
Content-Type: application/json

{
  "receiver": "event-rule",
  "status": "firing",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighCPU",
        "severity": "warning",
        "instance": "server-01:9100"
      },
      "annotations": {
        "description": "CPU usage is above 80%"
      },
      "startsAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Agent指标上报
```
POST /api/v1/agent/{agentId}/metrics
Authorization: Bearer {token}
Content-Type: application/json

{
  "host": "server-01",
  "cpu": 75.5,
  "memory": 62.3,
  "disk": 45.2,
  "network": 128.5,
  "labels": {
    "environment": "prod"
  }
}
```

## 规则DSL语法

```sql
SELECT count(*) 
FROM events 
WHERE label.service='payment' 
WINDOW 5m 
HAVING count > 10 
THEN alert(severity='critical', name='PaymentErrorHigh')
```

支持的语法:
- `SELECT`: `count(*)`, `sum(metric_name)`, `avg(metric_name)`
- `WHERE`: `label.xxx='value'` 多个条件用 `AND` 连接
- `WINDOW`: `1m`, `5m`, `1h` 等
- `HAVING`: `count > 10`, `sum > 100` 等
- `THEN`: `alert(severity='critical', name='告警名称')`

## 开发

### 后端开发
```bash
cd backend
npm install
npm run start:dev
```

### 前端开发
```bash
cd frontend
npm install
npm run dev
```

## 生产部署

1. 修改 `.env` 文件中的敏感信息
2. 调整 `docker-compose.yml` 中的资源限制
3. 配置HTTPS证书
4. 设置备份策略 (PostgreSQL数据和Redis数据)
5. 配置日志收集

## License

MIT
