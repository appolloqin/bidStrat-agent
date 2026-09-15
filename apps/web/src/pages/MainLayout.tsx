import { Layout, Menu, Avatar, Dropdown, Tag } from 'antd';
import {
  ProjectOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  ExperimentOutlined,
  AuditOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { roleDict } from '../lib/dict';

const { Sider, Header, Content } = Layout;

const items = [
  { key: '/projects', icon: <ProjectOutlined />, label: '项目工作台' },
  { key: '/memory', icon: <DatabaseOutlined />, label: '记忆管理' },
  { key: '/skills', icon: <ThunderboltOutlined />, label: '技能库' },
  { key: '/experience', icon: <ExperimentOutlined />, label: '经验卡审批' },
  { key: '/knowledge', icon: <BookOutlined />, label: '知识库' },
  { key: '/runs', icon: <BulbOutlined />, label: 'Agent 执行' },
  { key: '/audit', icon: <AuditOutlined />, label: '审计日志' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

export function MainLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, logout } = useAuthStore();
  const selected = items.find((i) => loc.pathname.startsWith(i.key))?.key ?? '/projects';

  return (
    <Layout className="layout">
      <Sider width={220} theme="dark">
        <div className="logo">⚡ 竞策智能体</div>
        <div className="brand-bar" />
        <Menu theme="dark" mode="inline" selectedKeys={[selected]} items={items} onClick={({ key }) => nav(key)} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontWeight: 600 }}>
            {items.find((i) => i.key === selected)?.label}
          </div>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: () => {
                    logout();
                    nav('/login', { replace: true });
                  },
                },
              ],
            }}
          >
            <span style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ marginRight: 8 }} />
              {user?.displayName || user?.username}
              <Tag color="blue" style={{ marginLeft: 8 }}>
                {user?.role ? roleDict[user.role] : ''}
              </Tag>
            </span>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, background: '#f5f7fa' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}