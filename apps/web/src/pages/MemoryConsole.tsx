import { App, Button, Card, Form, Input, List, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../lib/http';
import { MemoryType, VersionStatus } from '@bidstrat/shared';
import { memoryTypeDict, versionStatusDict } from '../lib/dict';

interface MemoryRow {
  id: string;
  memType: MemoryType;
  content: string;
  tags: string[] | null;
  confidence: number;
  status: VersionStatus;
  version: number;
  updatedAt: string;
}

export function MemoryConsolePage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');

  const load = async () => {
    setRows(await api<MemoryRow[]>('GET', '/memories'));
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    const v = await form.validateFields();
    await api('POST', '/memories', {
      memType: v.memType,
      content: v.content,
      tags: v.tags,
      confidence: v.confidence,
    });
    message.success('已新增语义记忆');
    setOpen(false);
    form.resetFields();
    load();
  };

  const disable = async (id: string) => {
    await api('POST', `/memories/${id}/disable`);
    load();
  };

  const filtered = rows.filter((r) => (search ? r.content.includes(search) || (r.tags || []).some((t) => t.includes(search)) : true));

  return (
    <Card
      title={<Typography.Title level={4} style={{ margin: 0 }}>记忆管理</Typography.Title>}
      extra={
        <Space>
          <Input.Search placeholder="按内容/标签搜索" onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
          <Button type="primary" onClick={() => setOpen(true)}>新增记忆</Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        dataSource={filtered}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '类型', dataIndex: 'memType', width: 110, render: (t: MemoryType) => <Tag color={memoryTypeDict[t]?.color}>{memoryTypeDict[t]?.text ?? t}</Tag> },
          { title: '内容', dataIndex: 'content', ellipsis: true },
          {
            title: '标签',
            dataIndex: 'tags',
            width: 200,
            render: (tags: string[] | null) => (
              <Space wrap>{(tags || []).map((t) => <Tag key={t}>{t}</Tag>)}</Space>
            ),
          },
          { title: '置信度', dataIndex: 'confidence', width: 90, render: (v: number) => v.toFixed(2) },
          { title: '版本', dataIndex: 'version', width: 80 },
          { title: '状态', dataIndex: 'status', width: 100, render: (s: VersionStatus) => <Tag color={versionStatusDict[s]?.color}>{versionStatusDict[s]?.text ?? s}</Tag> },
          { title: '操作', width: 120, render: (_, r) => r.status === 'ACTIVE' && <Button danger size="small" onClick={() => disable(r.id)}>停用</Button> },
        ]}
      />
      <Modal title="新增记忆" open={open} onCancel={() => setOpen(false)} onOk={onCreate} okText="保存">
        <Form form={form} layout="vertical" initialValues={{ memType: 'SEMANTIC', confidence: 0.8 }}>
          <Form.Item label="类型" name="memType" rules={[{ required: true }]}>
            <Select options={[{ value: 'SEMANTIC', label: '语义记忆' }, { value: 'EPISODIC', label: '情景记忆' }]} />
          </Form.Item>
          <Form.Item label="内容" name="content" rules={[{ required: true }]}>
            <Input.TextArea autoSize={{ minRows: 4 }} placeholder="例如：我司在XX行业常用的方案方法论" />
          </Form.Item>
          <Form.Item label="标签" name="tags">
            <Select mode="tags" placeholder="按回车添加标签" />
          </Form.Item>
          <Form.Item label="置信度" name="confidence">
            <Input type="number" min={0} max={1} step={0.1} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}