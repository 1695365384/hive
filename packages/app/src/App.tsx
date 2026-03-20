import { Layout } from './components/layout/Layout';
import { ChatContainer } from './components/chat/ChatContainer';

function App() {
  // Sidecar service 现在由 Tauri 后端自动启动
  // 不需要在前端手动调用 startService()

  return (
    <Layout>
      <ChatContainer />
    </Layout>
  );
}

export default App;
