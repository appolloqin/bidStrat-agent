import { Button, Card, Checkbox, Input, Select, Space, Table, Tag, App } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../../lib/http';
import { conclusionDict } from '../../lib/dict';

interface ResponseRow {
  id: string;
  requirementId: string;
  conclusion: 'FULLY_MET' | 'PARTIALLY_MET' | 'DEVIATION' | 'NOT_MET';
  content: string;
  confirmed: boolean;
  sourceRefs?: { type: string; id: string; title: string }[];
}

export function ResponsesPanel({ projectId }: { projectId: string }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Record<string, ResponseRow>>({});

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api<ResponseRow[]>('GET', '/responses', undefined, { params: { projectId } }));
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
    await api('PUT', `/responses/${id}`, {
      conclusion: patch.conclusion,
      content: patch.content,
      confirmed: patch.confirmed,
    });
    message.success('已保存');
    setEditing((s) => {
      const ns = { ...s };
      delete ns[id];
      return ns;
    });
    load();
  };

  const update = (id: string, patch: Partial<ResponseRow>) => {
    setEditing((s) => ({ ...s, [id]: { ...(s[id] || rows.find((r) => r.id === id)!), ...patch } }));
  };

  return (
    <Card
      title="应答矩阵（点对点应答 Agent 草稿，人工定稿后生成章节）"
      extra={
        <Space>
          <Button onClick={() => api('POST', '/memories/_refresh', {}).catch(() => null)}>同步记忆</Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        columns={[
          {
            title: '结论',
            width: 150,
            render: (_, r) => (
              <Select
                value={editing[r.id]?.conclusion ?? r.conclusion}
                style={{ width: '100%' }}
                options={Object.keys(conclusionDict).map((v) => ({
                  value: v,
                  label: <Tag color={conclusionDict[v as keyof typeof conclusionDict].color}>{conclusionDict[v as keyof typeof conclusionDict].text}</Tag>,
                }))}
                onChange={(v) => update(r.id, { conclusion: v as ResponseRow['conclusion'] })}
              />
            ),
          },
          {
            title: '应答内容',
            render: (_, r) => (
              <Input.TextArea
                autoSize={{ minRows: 2, maxRows: 8 }}
                defaultValue={r.content}
                onChange={(e) => update(r.id, { content: e.target.value })}
              />
            ),
          },
          {
            title: '引用',
            width: 200,
            render: (_, r) => (
              <Space wrap>
                {(r.sourceRefs || []).map((s, i) => (
                  <Tag key={i} color={s.type === 'KB' ? 'blue' : s.type === 'MEMORY' ? 'purple' : 'default'}>
                    {s.title?.slice(0, 14) || s.id}
                  </Tag>
                ))}
              </Space>
            ),
          },
          {
            title: '确认',
            width: 90,
            render: (_, r) => (
              <Checkbox
                checked={editing[r.id]?.confirmed ?? r.confirmed}
                onChange={(e) => update(r.id, { confirmed: e.target.checked })}
              />
            ),
          },
          {
            title: '操作',
            width: 90,
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