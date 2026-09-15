import { Form, Input, Button, Card, Typography, App } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/http';
import { useAuthStore } from '../store/auth';
import { Role } from '@bidstrat/shared';

interface LoginResp {
  accessToken: string;
  user: { id: string; username: string; displayName: string; role: Role; tenantId: string };
}

export function LoginPage() {
  const nav = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const data = await api<LoginResp>('POST', '/auth/login', values);
      setAuth(data.accessToken, data.user);
      message.success('登录成功');
      nav('/projects', { replace: true });
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1677ff 0%,#69b1ff 100%)' }}>
      <Card style={{ width: 400 }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginTop: 0 }}>
          竞策智能体
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
          自进化标书 Agent · 一个 Agent + 工具集 + 自进化闭环
        </Typography.Paragraph>
        <Form layout="vertical" onFinish={onFinish} initialValues={{ username: 'admin', password: 'admin123' }}>
          <Form.Item label="账号" name="username" rules={[{ required: true }]}>
            <Input size="large" placeholder="账号" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password size="large" placeholder="密码" />
          </Form.Item>
          <Button type="primary" size="large" block loading={loading} htmlType="submit">
            登 录
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, textAlign: 'center' }}>
          默认管理员：admin / admin123 · 专员：user / user123
        </Typography.Paragraph>
      </Card>
    </div>
  );
}