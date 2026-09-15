import { Button, Card, Empty, List, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/http';
import { runStatusDict, stepStatusDict, toolDict } from '../lib/dict';
import { ToolName } from '@bidstrat/shared';

interface AgentRun {
  id: string;
  projectId: string;
  status: string;
  totalTokens: number;
  startedAt: string;
  finishedAt: string | null;
  lastActivityAt: string | null;
  currentStepId: string | null;
  error?: string | null;
}

interface AgentStep {
  id: string;
  stepId: string;
  tool: string;
  title: string;
  status: string;
  durationMs: number;
  tokens: number;
  createdAt: string;
}

interface ProjectRow {
  id: string;
  tenderName: string;
}

export function AgentRunsPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<AgentRun[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<{ run: AgentRun; steps: AgentStep[] } | null>(null);

  const nameOf = (projectId: string) => projectNames[projectId] || projectId;

  const openRun = async (id: string) => {
    const d = await api<AgentRun & { steps: AgentStep[] }>('GET', `/agent-runs/${id}`);
    setActive({ run: d, steps: d.steps });
    setActiveId(id);
  };

  const load = async () => {
    const [list, projects] = await Promise.all([
      api<AgentRun[]>('GET', '/agent-runs'),
      api<ProjectRow[]>('GET', '/projects'),
    ]);
    setRows(list);
    setProjectNames(Object.fromEntries(projects.map((p) => [p.id, p.tenderName])));
    if (list.length && !activeId) {
      await openRun(list[0].id);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title={<Typography.Title level={4} style={{ margin: 0 }}>Agent 执行轨迹与成本</Typography.Title>}>
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          rowClassName={(r) => (r.id === activeId ? 'ant-table-row-selected' : '')}
          onRow={(r) => ({ onClick: () => openRun(r.id), style: { cursor: 'pointer' } })}
          columns={[
            {
              title: '项目',
              dataIndex: 'projectId',
              render: (pid: string) => (
                <a
                  onClick={(e) => {
                    e.stopPropagation();
                    nav(`/projects/${pid}`);
                  }}
                >
                  {nameOf(pid)}
                </a>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 110,
              render: (s: string) => (
                <Tag color={runStatusDict[s as keyof typeof runStatusDict]?.color}>
                  {runStatusDict[s as keyof typeof runStatusDict]?.text ?? s}
                </Tag>
              ),
            },
            { title: '消耗 Tokens', dataIndex: 'totalTokens', width: 120 },
            {
              title: '最后活动',
              dataIndex: 'lastActivityAt',
              width: 180,
              render: (v: string | null) => (v ? new Date(v).toLocaleString() : '-'),
            },
            {
              title: '开始时间',
              dataIndex: 'startedAt',
              width: 160,
              render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
            },
            {
              title: '结束时间',
              dataIndex: 'finishedAt',
              width: 160,
              render: (v: string | null) => (v ? new Date(v).toLocaleString() : '-'),
            },
          ]}
        />
      </Card>
      <Card title={active ? `执行步骤 · ${nameOf(active.run.projectId)}` : '执行步骤'}>
        {!active ? (
          <Empty description="选择上方一条执行记录查看步骤" />
        ) : (
          <>
            <Space style={{ marginBottom: 12 }}>
              <span className="muted">运行 ID：{active.run.id}</span>
              <span className="muted">
                当前步骤：{active.run.currentStepId ?? '-'}
              </span>
              <Button size="small" onClick={() => nav(`/projects/${active.run.projectId}`)}>
                查看项目
              </Button>
            </Space>
            {active.run.error && (
              <div style={{ marginBottom: 12, color: '#a8071a' }}>异常：{active.run.error}</div>
            )}
            <List
              dataSource={active.steps}
              renderItem={(s) => (
                <List.Item>
                  <Space wrap>
                    <Tag color={stepStatusDict[s.status as keyof typeof stepStatusDict]?.color}>
                      {stepStatusDict[s.status as keyof typeof stepStatusDict]?.text ?? s.status}
                    </Tag>
                    <Tag color="blue">{toolDict[s.tool as ToolName] ?? s.tool}</Tag>
                    <b>{s.title}</b>
                    <span className="muted">{s.durationMs}ms · {s.tokens} tokens</span>
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}
      </Card>
    </Space>
  );
}
