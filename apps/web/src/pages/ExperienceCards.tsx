import { App, Button, Card, Drawer, List, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../lib/http';
import { gateStatusDict, targetDict } from '../lib/dict';

interface ExperienceCard {
  id: string;
  scenario: string;
  before: string | null;
  after: string | null;
  rule: string;
  target: 'SEMANTIC_MEMORY' | 'SKILL' | 'EPISODIC_MEMORY';
  evidence: unknown;
  confidence: number;
  gateStatus: 'PENDING' | 'EVAL_RUNNING' | 'EVAL_PASSED' | 'APPROVED' | 'REJECTED' | 'ROLLED_BACK';
  createdAt: string;
  decidedAt: string | null;
}

export function ExperienceCardsPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<ExperienceCard[]>([]);
  const [active, setActive] = useState<ExperienceCard | null>(null);

  const load = async () => {
    setRows(await api<ExperienceCard[]>('GET', '/experience-cards'));
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (id: string) => {
    try {
      await api('POST', `/experience-cards/${id}/approve`);
      message.success('已审批生效（先评估后升级）');
      load();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '审批失败');
    }
  };

  const reject = async (id: string) => {
    await api('POST', `/experience-cards/${id}/reject`);
    message.success('已拒绝');
    load();
  };

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>经验卡审批 · 双门控（评估通过 → 人工批准）</Typography.Title>}>
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: '场景', dataIndex: 'scenario' },
          {
            title: '目标',
            dataIndex: 'target',
            width: 160,
            render: (t: ExperienceCard['target']) => (
              <Tag color={targetDict[t]?.color}>{targetDict[t]?.text ?? t}</Tag>
            ),
          },
          { title: '规则', dataIndex: 'rule', ellipsis: true },
          { title: '置信度', dataIndex: 'confidence', width: 90, render: (v: number) => v.toFixed(2) },
          {
            title: '门控',
            dataIndex: 'gateStatus',
            width: 160,
            render: (s: ExperienceCard['gateStatus']) => (
              <Tag color={gateStatusDict[s]?.color}>{gateStatusDict[s]?.text ?? s}</Tag>
            ),
          },
          {
            title: '操作',
            width: 200,
            render: (_, r) =>
              r.gateStatus === 'PENDING' || r.gateStatus === 'EVAL_PASSED' ? (
                <Space>
                  <Button type="primary" size="small" onClick={() => approve(r.id)}>批准</Button>
                  <Button danger size="small" onClick={() => reject(r.id)}>拒绝</Button>
                </Space>
              ) : (
                <Button size="small" onClick={() => setActive(r)}>详情</Button>
              ),
          },
        ]}
      />
      <Drawer open={!!active} onClose={() => setActive(null)} width={720} title="经验卡详情">
        {active && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Title level={5}>{active.scenario}</Typography.Title>
            <Card size="small" title="变更前"><pre>{active.before}</pre></Card>
            <Card size="small" title="变更后"><pre>{active.after}</pre></Card>
            <Card size="small" title="提炼规则"><pre>{active.rule}</pre></Card>
          </Space>
        )}
      </Drawer>
    </Card>
  );
}