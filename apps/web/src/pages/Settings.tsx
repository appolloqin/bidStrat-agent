import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { api } from '../lib/http';
import { useAuthStore } from '../store/auth';

interface PublicLlmConfig {
  id: string | null;
  source: 'db' | 'env' | 'mock';
  name: string;
  provider: 'openai-compatible' | 'mock';
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  enabled: boolean;
  thinkingEnabled: boolean;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  updatedAt: string | null;
}

interface LlmConfigListResult {
  items: PublicLlmConfig[];
  active: PublicLlmConfig;
}

interface TestResult {
  ok: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  message: string;
}

const emptyForm = {
  name: '',
  provider: 'openai-compatible' as const,
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  temperature: 0.3,
  maxTokens: undefined as number | undefined,
  enabled: true,
  thinkingEnabled: true,
  apiKey: '',
};

export function SettingsPage() {
  const { message } = App.useApp();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [items, setItems] = useState<PublicLlmConfig[]>([]);
  const [active, setActive] = useState<PublicLlmConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const selected = creating ? null : items.find((i) => i.id === selectedId) ?? null;

  const fillForm = (cfg: PublicLlmConfig | null, isNew = false) => {
    if (isNew || !cfg) {
      form.setFieldsValue({ ...emptyForm, name: `模型配置 ${items.length + 1}` });
      return;
    }
    form.setFieldsValue({
      name: cfg.name,
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens ?? undefined,
      enabled: cfg.enabled,
      thinkingEnabled: cfg.thinkingEnabled,
      apiKey: '',
    });
  };

  const load = async (preferId?: string | null) => {
    setLoading(true);
    try {
      const data = await api<LlmConfigListResult>('GET', '/llm-config');
      setItems(data.items);
      setActive(data.active);
      const nextId =
        preferId && data.items.some((i) => i.id === preferId)
          ? preferId
          : data.items.find((i) => i.isDefault)?.id ?? data.items[0]?.id ?? null;
      setCreating(false);
      setSelectedId(nextId);
      const next = data.items.find((i) => i.id === nextId) ?? null;
      fillForm(next);
      setTestResult(null);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载模型配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectItem = (id: string) => {
    const cfg = items.find((i) => i.id === id);
    if (!cfg) return;
    setCreating(false);
    setSelectedId(id);
    setTestResult(null);
    fillForm(cfg);
  };

  const startCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setTestResult(null);
    fillForm(null, true);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const v = await form.validateFields();
      const payload: Record<string, unknown> = {
        name: v.name,
        provider: v.provider,
        baseUrl: v.baseUrl,
        model: v.model,
        temperature: v.temperature,
        maxTokens: v.maxTokens ?? null,
        enabled: v.enabled,
        thinkingEnabled: v.thinkingEnabled ?? true,
      };
      if (typeof v.apiKey === 'string' && v.apiKey.length > 0) payload.apiKey = v.apiKey;

      if (creating) {
        payload.isDefault = items.length === 0;
        const created = await api<PublicLlmConfig>('POST', '/llm-config', payload);
        message.success('已新建并加密保存');
        await load(created.id);
      } else if (selectedId) {
        await api<PublicLlmConfig>('PUT', `/llm-config/${selectedId}`, payload);
        message.success('模型配置已加密保存');
        await load(selectedId);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const v = await form.getFieldsValue();
      const result = await api<TestResult>('POST', '/llm-config/test', {
        id: creating ? undefined : selectedId ?? undefined,
        baseUrl: v.baseUrl,
        model: v.model,
        apiKey: v.apiKey && v.apiKey.length > 0 ? v.apiKey : undefined,
      });
      setTestResult(result);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '测试失败');
    } finally {
      setTesting(false);
    }
  };

  const clearApiKey = async () => {
    if (!selectedId || creating) return;
    setSaving(true);
    try {
      await api<PublicLlmConfig>('PUT', `/llm-config/${selectedId}`, { apiKey: '' });
      message.success('已清除 API Key');
      await load(selectedId);
    } finally {
      setSaving(false);
    }
  };

  const setAsDefault = async (id: string) => {
    try {
      await api<PublicLlmConfig>('POST', `/llm-config/${id}/default`);
      message.success('已设为默认模型');
      await load(id);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '设置默认失败');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await api('DELETE', `/llm-config/${id}`);
      message.success('已删除');
      await load();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        loading={loading}
        title={<Typography.Title level={4} style={{ margin: 0 }}>模型配置（加密存储）</Typography.Title>}
        extra={
          <Space wrap>
            {active && (
              <Tag color={active.source === 'db' ? 'blue' : active.source === 'env' ? 'gold' : 'default'}>
                当前生效：{active.name}
                {active.source !== 'db' ? `（${active.source}）` : ''}
              </Tag>
            )}
            {isAdmin && (
              <Button type="primary" icon={<PlusOutlined />} onClick={startCreate}>
                新建配置
              </Button>
            )}
          </Space>
        }
      >
        {!isAdmin && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="仅管理员可修改模型配置，当前为只读。" />
        )}
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="可配置多个模型，勾选/点击「设为默认」后系统将使用该配置。API Key 使用 AES-256-GCM 加密入库，页面只显示脱敏值。"
        />

        <Row gutter={16}>
          <Col xs={24} lg={8}>
            <List
              bordered
              locale={{ emptyText: <Empty description="暂无数据库配置，将回落环境变量 / Mock" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              dataSource={items}
              renderItem={(item) => (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    background: !creating && selectedId === item.id ? 'rgba(22, 119, 255, 0.06)' : undefined,
                  }}
                  onClick={() => selectItem(item.id!)}
                  actions={
                    isAdmin
                      ? [
                          <Button
                            key="default"
                            type="link"
                            size="small"
                            disabled={item.isDefault || !item.enabled}
                            icon={item.isDefault ? <StarFilled /> : <StarOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!item.isDefault) setAsDefault(item.id!);
                            }}
                          >
                            {item.isDefault ? '默认' : '设为默认'}
                          </Button>,
                          <Popconfirm
                            key="del"
                            title="确认删除该模型配置？"
                            onConfirm={(e) => {
                              e?.stopPropagation();
                              onDelete(item.id!);
                            }}
                            onCancel={(e) => e?.stopPropagation()}
                          >
                            <Button type="link" size="small" danger onClick={(e) => e.stopPropagation()} disabled={!isAdmin}>
                              删除
                            </Button>
                          </Popconfirm>,
                        ]
                      : [
                          item.isDefault ? (
                            <Tag key="d" color="blue">
                              默认
                            </Tag>
                          ) : (
                            <span key="d" />
                          ),
                        ]
                  }
                >
                  <List.Item.Meta
                    title={
                      <Space size={8}>
                        <span>{item.name}</span>
                        {item.isDefault && <Tag color="blue">默认</Tag>}
                        {!item.enabled && <Tag>已停用</Tag>}
                      </Space>
                    }
                    description={`${item.provider === 'mock' ? 'Mock' : 'API'} · ${item.model}`}
                  />
                </List.Item>
              )}
            />
          </Col>

          <Col xs={24} lg={16}>
            {(creating || selected) ? (
              <Form
                form={form}
                layout="vertical"
                disabled={!isAdmin}
                initialValues={emptyForm}
              >
                {creating && (
                  <Alert type="success" showIcon style={{ marginBottom: 16 }} message="正在新建配置，保存后可再设为默认。" />
                )}
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item label="配置名称" name="name" rules={[{ required: true, max: 128 }]}>
                      <Input placeholder="例如：MiniMax / DeepSeek" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="提供方" name="provider" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { value: 'openai-compatible', label: 'OpenAI 兼容接口（API）' },
                          { value: 'mock', label: '离线 Mock（无需联网）' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="Base URL" name="baseUrl" tooltip="OpenAI 兼容 /chat/completions 基地址">
                  <Input placeholder="https://api.openai.com/v1" />
                </Form.Item>
                <Form.Item
                  label="API Key"
                  name="apiKey"
                  extra={
                    !creating && selected?.hasApiKey
                      ? `当前已保存：${selected.apiKeyMasked}`
                      : '尚未配置 API Key'
                  }
                >
                  <Input.Password
                    placeholder={!creating && selected?.hasApiKey ? '留空表示不修改' : '粘贴新的 API Key'}
                    autoComplete="new-password"
                  />
                </Form.Item>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item label="模型名称" name="model">
                      <Input placeholder="gpt-4o-mini" />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item label="温度" name="temperature" tooltip="0-2，越大越发散">
                      <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item label="最大 Tokens" name="maxTokens" tooltip="留空表示不限制">
                      <InputNumber min={1} max={1000000} style={{ width: '100%' }} placeholder="不限制" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item
                  label="思考模式（reasoning）"
                  name="thinkingEnabled"
                  valuePropName="checked"
                  tooltip="MiniMax M3 / DeepSeek-R1 等推理模型默认开启。关闭后请求将携带 enable_thinking=false"
                >
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                </Form.Item>
                <Form.Item label="是否启用该配置" name="enabled" valuePropName="checked">
                  <Switch checkedChildren="启用" unCheckedChildren="停用" />
                </Form.Item>
                <Space wrap>
                  <Button type="primary" loading={saving} onClick={onSave} disabled={!isAdmin}>
                    {creating ? '创建并保存' : '保存配置'}
                  </Button>
                  <Button loading={testing} onClick={onTest} disabled={!isAdmin}>
                    测试连接
                  </Button>
                  {!creating && selected?.isDefault === false && selected?.enabled && (
                    <Button
                      icon={<StarOutlined />}
                      disabled={!isAdmin}
                      onClick={() => selectedId && setAsDefault(selectedId)}
                    >
                      设为默认
                    </Button>
                  )}
                  {!creating && (
                    <Button danger onClick={clearApiKey} disabled={!isAdmin || !selected?.hasApiKey}>
                      清除 API Key
                    </Button>
                  )}
                  {creating && (
                    <Button
                      onClick={() => {
                        setCreating(false);
                        const back = items.find((i) => i.isDefault) ?? items[0];
                        setSelectedId(back?.id ?? null);
                        fillForm(back ?? null);
                      }}
                    >
                      取消新建
                    </Button>
                  )}
                </Space>
              </Form>
            ) : (
              <Empty description="请选择左侧配置，或点击「新建配置」" />
            )}
            {testResult && (
              <Alert
                style={{ marginTop: 16 }}
                type={testResult.ok ? 'success' : 'error'}
                showIcon
                message={`测试${testResult.ok ? '成功' : '失败'}（${testResult.provider} / ${testResult.model} / ${testResult.latencyMs}ms）`}
                description={testResult.message}
              />
            )}
          </Col>
        </Row>
      </Card>

      <Card title="系统信息">
        <Descriptions bordered column={1}>
          <Descriptions.Item label="默认账号">
            管理员 admin / admin123 · 投标专员 user / user123
          </Descriptions.Item>
          <Descriptions.Item label="数据库">SQLite（自动创建，桌面端默认） / MySQL 8（DB_TYPE=mysql）</Descriptions.Item>
          <Descriptions.Item label="模型配置">
            可配置多个；加密存于 t_llm_config；运行时使用默认启用项，未配置时回落环境变量，最终回落离线 Mock
          </Descriptions.Item>
          <Descriptions.Item label="租户隔离">全表 tenant_id；JWT 携带租户上下文</Descriptions.Item>
          <Descriptions.Item label="Agent 模式">Plan → Execute 循环；默认自动续跑（AGENT_AUTO_CONTINUE）</Descriptions.Item>
          <Descriptions.Item label="自进化闭环">人工定稿采集 diff → 复盘生成经验卡 → 双门控生效 → 一键回滚</Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  );
}
