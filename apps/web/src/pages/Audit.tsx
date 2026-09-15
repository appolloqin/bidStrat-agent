import { Card, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../lib/http';
import { auditActionDict, targetTypeDict } from '../lib/dict';

interface AuditRow {
  id: string;
  operatorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  useEffect(() => {
    api<AuditRow[]>('GET', '/audit').then(setRows);
  }, []);
  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>审计日志</Typography.Title>}>
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '操作人', dataIndex: 'operatorName', width: 120, render: (v: string | null) => v || '-' },
          {
            title: '动作',
            dataIndex: 'action',
            width: 160,
            render: (a: string) => <Tag color="blue">{auditActionDict[a] ?? a}</Tag>,
          },
          {
            title: '对象类型',
            dataIndex: 'targetType',
            width: 130,
            render: (t: string | null) => (t ? targetTypeDict[t] ?? t : '-'),
          },
          { title: '对象 ID', dataIndex: 'targetId', width: 120, render: (v: string | null) => v || '-' },
          {
            title: '详情',
            dataIndex: 'detail',
            render: (d: Record<string, unknown> | null) => (
              <code style={{ fontSize: 12, color: '#6b7280' }}>{d ? JSON.stringify(d).slice(0, 160) : '-'}</code>
            ),
          },
          { title: '时间', dataIndex: 'createdAt', width: 180, render: (v: string) => new Date(v).toLocaleString() },
        ]}
      />
    </Card>
  );
}
