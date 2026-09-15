import { App, Button, Card, Form, Input, List, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../lib/http';
import { KBAssetType } from '@bidstrat/shared';
import { kbAssetTypeDict } from '../lib/dict';

interface KBAsset {
  id: string;
  assetType: KBAssetType;
  title: string;
  content: string;
  updatedAt: string;
}

interface KBHit {
  type: 'KB' | 'MEMORY';
  id: string;
  title: string;
  snippet: string;
  score: number;
}

export function KnowledgeBasePage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KBAsset[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KBHit[]>([]);

  const load = async () => {
    setRows(await api<KBAsset[]>('GET', '/kb/assets'));
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    const v = await form.validateFields();
    await api('POST', '/kb/assets', v);
    message.success('已入库');
    setOpen(false);
    form.resetFields();
    load();
  };

  const remove = async (id: string) => {
    await api('DELETE', `/kb/assets/${id}`);
    load();
  };

  const doSearch = async () => {
    if (!query.trim()) return setHits([]);
    const r = await api<KBHit[]>('POST', '/kb/search', { query, topK: 8 });
    setHits(r);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title={<Typography.Title level={4} style={{ margin: 0 }}>知识库检索（混合：KB 切块 + 语义记忆）</Typography.Title>}
      >
        <Space.Compact style={{ width: '100%' }}>
          <Input.Search
            placeholder="尝试搜索：等保三级、政务云、实施案例..."
            enterButton="检索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSearch={doSearch}
            size="large"
          />
        </Space.Compact>
        <List
          style={{ marginTop: 16 }}
          dataSource={hits}
          locale={{ emptyText: '暂无结果' }}
          renderItem={(h) => (
            <List.Item>
              <List.Item.Meta
                title={<Space><Tag color={h.type === 'KB' ? 'blue' : 'purple'}>{h.type}</Tag>{h.title}</Space>}
                description={<>{h.snippet}<div className="muted">相似度 {(h.score * 100).toFixed(1)}%</div></>}
              />
            </List.Item>
          )}
        />
      </Card>
      <Card
        title="知识库资产"
        extra={<Button type="primary" onClick={() => setOpen(true)}>新增资产</Button>}
      >
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '标题', dataIndex: 'title' },
            { title: '类型', dataIndex: 'assetType', width: 120, render: (t: KBAssetType) => <Tag>{kbAssetTypeDict[t] ?? t}</Tag> },
            { title: '摘要', dataIndex: 'content', ellipsis: true },
            { title: '操作', width: 100, render: (_, r) => <Button danger size="small" onClick={() => remove(r.id)}>删除</Button> },
          ]}
        />
      </Card>
      <Modal title="新增知识资产" open={open} onCancel={() => setOpen(false)} onOk={onCreate} okText="保存">
        <Form form={form} layout="vertical" initialValues={{ assetType: 'QUALIFICATION' }}>
          <Form.Item label="标题" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="类型" name="assetType" rules={[{ required: true }]}>
            <Select
              options={(['QUALIFICATION', 'PERFORMANCE', 'MATERIAL', 'RESUME', 'TEMPLATE'] as KBAssetType[]).map((v) => ({
                value: v,
                label: kbAssetTypeDict[v],
              }))}
            />
          </Form.Item>
          <Form.Item label="内容" name="content" rules={[{ required: true }]}>
            <Input.TextArea autoSize={{ minRows: 5 }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}