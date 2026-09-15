import { Button, Card, Checkbox, Input, Space, Table, Tag, App, Select, Popconfirm } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../../lib/http';
import { RequirementCategory } from '@bidstrat/shared';
import { categoryDict } from '../../lib/dict';

interface Requirement {
  id: string;
  ordinal: number;
  category: RequirementCategory;
  content: string;
  mandatory: boolean;
  confirmed: boolean;
}

export function RequirementsPanel({ projectId }: { projectId: string }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Record<string, Requirement>>({});

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api<Requirement[]>('GET', '/requirements', undefined, { params: { projectId } }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const save = async (id: string) => {
    const patch = editing[id];
    if (!patch) return;
    await api('PUT', `/requirements/${id}`, patch);
    message.success('已保存');
    setEditing((s) => {
      const ns = { ...s };
      delete ns[id];
      return ns;
    });
    load();
  };

  const update = (id: string, patch: Partial<Requirement>) => {
    setEditing((s) => ({ ...s, [id]: { ...(s[id] || rows.find((r) => r.id === id)!), ...patch } }));
  };

  const batchConfirm = async (confirmed: boolean) => {
    const ids = rows.filter((r) => r.confirmed !== confirmed).map((r) => r.id);
    if (ids.length === 0) return;
    await api('PUT', '/requirements/batch/confirm', { projectId, ids, confirmed });
    message.success(confirmed ? '已全部确认' : '已取消确认');
    load();
  };

  return (
    <Card
      title="招标要点（人工确认后进入应答矩阵生成）"
      extra={
        <Space>
          <Button onClick={() => batchConfirm(true)} type="primary">一键确认全部</Button>
          <Popconfirm title="取消全部确认？" onConfirm={() => batchConfirm(false)}>
            <Button>取消确认</Button>
          </Popconfirm>
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 50 }}
        columns={[
          { title: '#', width: 50, render: (_, r) => r.ordinal },
          {
            title: '类别',
            dataIndex: 'category',
            width: 140,
            render: (c: RequirementCategory, r) => (
              <Select
                value={editing[r.id]?.category ?? c}
                style={{ width: '100%' }}
                options={(['QUALIFICATION', 'TECHNICAL', 'COMMERCIAL', 'SCORING', 'DELIVERY', 'DISQUALIFIER'] as RequirementCategory[]).map((v) => ({
                  value: v,
                  label: <Tag color={categoryDict[v].color}>{categoryDict[v].text}</Tag>,
                }))}
                onChange={(v) => update(r.id, { category: v })}
              />
            ),
          },
          {
            title: '要点',
            dataIndex: 'content',
            render: (c: string, r) => (
              <Input.TextArea
                autoSize={{ minRows: 1, maxRows: 4 }}
                defaultValue={c}
                onChange={(e) => update(r.id, { content: e.target.value })}
              />
            ),
          },
          {
            title: '强制',
            width: 80,
            render: (_, r) => (
              <Checkbox
                checked={editing[r.id]?.mandatory ?? r.mandatory}
                onChange={(e) => update(r.id, { mandatory: e.target.checked })}
              />
            ),
          },
          {
            title: '确认',
            width: 100,
            render: (_, r) => (
              <Checkbox
                checked={editing[r.id]?.confirmed ?? r.confirmed}
                onChange={(e) => update(r.id, { confirmed: e.target.checked })}
              />
            ),
          },
          {
            title: '操作',
            width: 100,
            render: (_, r) => (
              <Button type="link" onClick={() => save(r.id)} disabled={!editing[r.id]}>
                保存
              </Button>
            ),
          },
        ]}
      />
    </Card>
  );
}