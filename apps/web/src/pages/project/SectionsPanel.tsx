import { App, Button, Card, Drawer, Form, Input, List, Modal, Rate, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../../lib/http';
import { ComplianceFinding, SelfReviewResult } from '@bidstrat/shared';
import { sectionStatusDict } from '../../lib/dict';

interface Section {
  id: string;
  outlineNo: string;
  title: string;
  content: string | null;
  reviewScore: number | null;
  status: 'GENERATED' | 'FINALIZED' | 'EDITED';
  genVersion: number;
  finalVersion: number;
}

const levelDict: Record<ComplianceFinding['level'], { text: string; color: string }> = {
  RED: { text: '高风险', color: 'red' },
  YELLOW: { text: '提醒', color: 'gold' },
  GREEN: { text: '通过', color: 'green' },
};

export function SectionsPanel({ projectId }: { projectId: string }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Section[]>([]);
  const [active, setActive] = useState<Section | null>(null);
  const [review, setReview] = useState<{ result?: SelfReviewResult; findings?: ComplianceFinding[] }>({});
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [finalContent, setFinalContent] = useState('');
  const [instruction, setInstruction] = useState('');
  const [rating, setRating] = useState<number>(4);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api<Section[]>('GET', '/sections', undefined, { params: { projectId } }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const open = async (s: Section) => {
    setActive(s);
    setFinalContent(s.content || '');
    setReview({});
    try {
      const r = await api<{ result: SelfReviewResult; findings: ComplianceFinding[] }>('POST', `/sections/${s.id}/review`);
      setReview(r);
    } catch {}
  };

  const doRewrite = async () => {
    if (!active) return;
    const updated = await api<Section>('POST', `/sections/${active.id}/rewrite`, { instruction });
    message.success('已重写');
    setActive(updated);
    setFinalContent(updated.content || '');
    setRewriteOpen(false);
    setInstruction('');
    load();
  };

  const doFeedback = async () => {
    if (!active) return;
    await api('PUT', `/sections/${active.id}/feedback`, {
      finalContent,
      rating: rating >= 4 ? 'GOOD' : rating >= 3 ? 'OK' : 'REWRITE',
    });
    message.success('定稿已保存，已采集 diff');
    setFeedbackOpen(false);
    load();
  };

  return (
    <Card title="标书章节（Agent 生成 + 人工定稿；保存即采集 diff 用于自进化）" extra={<Button onClick={load}>刷新</Button>}>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '编号', dataIndex: 'outlineNo', width: 80 },
          { title: '标题', dataIndex: 'title' },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (s: Section['status']) => (
              <Tag color={sectionStatusDict[s]?.color}>{sectionStatusDict[s]?.text ?? s}</Tag>
            ),
          },
          {
            title: '自评',
            dataIndex: 'reviewScore',
            width: 100,
            render: (v: number | null) => (v !== null ? <Tag color={v >= 80 ? 'green' : v >= 60 ? 'gold' : 'red'}>{v}</Tag> : '-'),
          },
          {
            title: '版本',
            width: 120,
            render: (_, r) => `g${r.genVersion}/f${r.finalVersion}`,
          },
          {
            title: '操作',
            width: 160,
            render: (_, r) => (
              <Button type="link" onClick={() => open(r)}>
                打开
              </Button>
            ),
          },
        ]}
      />
      <Drawer
        width={840}
        open={!!active}
        onClose={() => setActive(null)}
        title={active?.title}
        destroyOnClose
        extra={
          active && (
            <Space>
              <Button onClick={() => setRewriteOpen(true)}>按指令重写</Button>
              <Button type="primary" onClick={() => setFeedbackOpen(true)}>保存定稿</Button>
            </Space>
          )
        }
      >
        {active && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" title="自评与合规检查">
              <Space size={16}>
                <div>
                  <Typography.Text type="secondary">自评分数</Typography.Text>
                  <div style={{ fontSize: 24, fontWeight: 700, color: (review.result?.score ?? 0) >= 80 ? '#52c41a' : (review.result?.score ?? 0) >= 60 ? '#faad14' : '#f5222d' }}>
                    {review.result?.score ?? '-'}
                  </div>
                </div>
              </Space>
              <List
                size="small"
                header={<b>失分点</b>}
                dataSource={review.result?.lostPoints || []}
                renderItem={(it) => <List.Item>{it}</List.Item>}
                style={{ marginTop: 8 }}
              />
              <List
                size="small"
                header={<b>改进建议</b>}
                dataSource={review.result?.suggestions || []}
                renderItem={(it) => <List.Item>{it}</List.Item>}
              />
              <List
                size="small"
                header={<b>合规与漏项</b>}
                dataSource={review.findings || []}
                renderItem={(f) => (
                  <List.Item>
                    <Tag color={levelDict[f.level]?.color}>{levelDict[f.level]?.text ?? f.level}</Tag>
                    {f.message}
                  </List.Item>
                )}
              />
            </Card>
            <Card size="small" title="章节内容">
              <Input.TextArea value={finalContent} onChange={(e) => setFinalContent(e.target.value)} autoSize={{ minRows: 12 }} />
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal title="按指令重写" open={rewriteOpen} onCancel={() => setRewriteOpen(false)} onOk={doRewrite} okText="执行">
        <Input.TextArea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="例如：突出我司在政务云方面的实施经验，加入等保三级、国产化适配、合规交付等关键词。"
          autoSize={{ minRows: 4 }}
        />
      </Modal>

      <Modal title="保存定稿（采集 diff 用于自进化）" open={feedbackOpen} onCancel={() => setFeedbackOpen(false)} onOk={doFeedback} okText="保存">
        <Form layout="vertical">
          <Form.Item label="总体评价">
            <Rate value={rating} onChange={setRating} />
          </Form.Item>
          <Form.Item label="评论">
            <Input.TextArea autoSize={{ minRows: 2 }} placeholder="可选，记录给 AI 的反馈" />
          </Form.Item>
          <Form.Item label="定稿内容预览">
            <Input.TextArea value={finalContent} onChange={(e) => setFinalContent(e.target.value)} autoSize={{ minRows: 6 }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}