import { App, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../lib/http';
import { ToolName, VersionStatus } from '@bidstrat/shared';
import { toolDict, versionStatusDict } from '../lib/dict';

interface SkillRow {
  id: string;
  name: string;
  trigger: string | null;
  promptTpl: string;
  tools: ToolName[] | null;
  version: number;
  status: VersionStatus;
  parentId: string | null;
}

const allTools: ToolName[] = ['parse_document', 'extract_requirements', 'search_knowledge', 'write_section', 'self_review', 'compliance_check', 'export_docx'];

export function SkillLibraryPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<SkillRow[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setRows(await api<SkillRow[]>('GET', '/skills'));
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    const v = await form.validateFields();
    await api('POST', '/skills', v);
    message.success('已新增技能');
    setOpen(false);
    form.resetFields();
    load();
  };

  const rollback = async (id: string) => {
    await api('POST', `/skills/${id}/rollback`);
    message.success('已回滚到上一版本');
    load();
  };

  return (
    <Card
      title={<Typography.Title level={4} style={{ margin: 0 }}>技能库</Typography.Title>}
      extra={<Button type="primary" onClick={() => setOpen(true)}>新增技能</Button>}
    >
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '触发条件', dataIndex: 'trigger', ellipsis: true },
          {
            title: '工具',
            dataIndex: 'tools',
            render: (tools: ToolName[] | null) => (
              <Space wrap>{(tools || []).map((t) => <Tag key={t}>{toolDict[t] ?? t}</Tag>)}</Space>
            ),
          },
          { title: '版本', dataIndex: 'version', width: 80 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (s: VersionStatus) => <Tag color={versionStatusDict[s]?.color}>{versionStatusDict[s]?.text ?? s}</Tag>,
          },
          {
            title: '操作',
            width: 200,
            render: (_, r) => (
              <Space>
                {r.parentId && <Button size="small" onClick={() => rollback(r.id)}>回滚</Button>}
              </Space>
            ),
          },
        ]}
      />
      <Modal title="新增技能" open={open} onCancel={() => setOpen(false)} onOk={onCreate} okText="保存">
        <Form form={form} layout="vertical" initialValues={{ tools: ['search_knowledge', 'self_review'] }}>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="触发条件" name="trigger">
            <Input placeholder="例如：撰写技术方案章节" />
          </Form.Item>
          <Form.Item label="Prompt 模板" name="promptTpl" rules={[{ required: true }]}>
            <Input.TextArea autoSize={{ minRows: 5 }} placeholder="支持 ${refs} 等占位符" />
          </Form.Item>
          <Form.Item label="可用工具" name="tools">
            <Select mode="multiple" options={allTools.map((t) => ({ value: t, label: t }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}