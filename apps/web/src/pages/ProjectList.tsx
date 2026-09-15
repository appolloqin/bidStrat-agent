import { Button, Card, Form, Input, Modal, Space, Table, Tag, Typography, App, DatePicker, Upload } from 'antd';
import { PlusOutlined, RocketOutlined, DeleteOutlined, CloudUploadOutlined, InboxOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/http';
import { uploadTenderDoc } from '../lib/tender';
import dayjs from 'dayjs';
import { ProjectStage, ProjectStatus } from '@bidstrat/shared';
import { stageDict, statusDict } from '../lib/dict';

interface ProjectRow {
  id: string;
  tenderName: string;
  tenderNo: string | null;
  deadline: string | null;
  stage: ProjectStage;
  status: ProjectStatus;
  won: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export function ProjectListPage() {
  const nav = useNavigate();
  const { message } = App.useApp();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api<ProjectRow[]>('GET', '/projects'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    const v = await form.validateFields();
    const project = await api<ProjectRow>('POST', '/projects', {
      tenderName: v.tenderName,
      tenderNo: v.tenderNo,
      deadline: v.deadline ? v.deadline.toISOString() : undefined,
      remark: v.remark,
    });
    if (pendingFile) {
      message.loading({ content: '项目已创建，正在上传招标文件…', key: 'create' });
      try {
        await uploadTenderDoc(project.id, pendingFile);
        message.success({ content: '项目已创建，招标文件已上传并开始解析', key: 'create' });
      } catch (e: unknown) {
        message.error({ content: e instanceof Error ? e.message : '文件上传失败', key: 'create' });
      }
    } else {
      message.success('项目已创建');
    }
    setOpen(false);
    form.resetFields();
    setPendingFile(null);
    load();
    nav(`/projects/${project.id}`);
  };

  const remove = async (id: string) => {
    await api('DELETE', `/projects/${id}`);
    message.success('已删除');
    load();
  };

  return (
    <Card
      title={<Typography.Title level={4} style={{ margin: 0 }}>项目工作台</Typography.Title>}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          新建项目
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: '招标项目', dataIndex: 'tenderName', ellipsis: true },
          { title: '招标编号', dataIndex: 'tenderNo', width: 160 },
          {
            title: '当前阶段',
            dataIndex: 'stage',
            width: 180,
            render: (s: ProjectStage) => <Tag color={stageDict[s]?.color}>{stageDict[s]?.text ?? s}</Tag>,
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (s: ProjectStatus) => <Tag color={statusDict[s]?.color}>{statusDict[s]?.text ?? s}</Tag>,
          },
          {
            title: '截止时间',
            dataIndex: 'deadline',
            width: 140,
            render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
          },
          {
            title: '操作',
            width: 280,
            render: (_, r) => (
              <Space>
                <Button type="link" icon={<CloudUploadOutlined />} onClick={() => nav(`/projects/${r.id}?tab=tender`)}>
                  上传招标文件
                </Button>
                <Button type="link" icon={<RocketOutlined />} onClick={() => nav(`/projects/${r.id}`)}>
                  进入
                </Button>
                <Button type="link" danger icon={<DeleteOutlined />} onClick={() => remove(r.id)} />
              </Space>
            ),
          },
        ]}
      />

      <Modal title="新建项目" open={open} onCancel={() => { setOpen(false); setPendingFile(null); }} onOk={onCreate} okText="创建" width={560}>
        <Form form={form} layout="vertical">
          <Form.Item label="招标项目名称" name="tenderName" rules={[{ required: true }]}>
            <Input placeholder="例：XX市智慧政务平台升级项目" />
          </Form.Item>
          <Form.Item label="招标编号" name="tenderNo">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item label="投标截止" name="deadline">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="招标文件（可选，创建后自动上传解析）">
            <Upload.Dragger
              multiple={false}
              maxCount={1}
              showUploadList={false}
              accept=".pdf,.docx,.doc,.txt,.md"
              beforeUpload={(file) => {
                setPendingFile(file as unknown as File);
                return false;
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">{pendingFile ? `已选择：${pendingFile.name}` : '点击或拖拽招标文件到此区域'}</p>
              <p className="ant-upload-hint">支持 PDF / Word / TXT / Markdown</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
