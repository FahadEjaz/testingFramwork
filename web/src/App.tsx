import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { PendingFixesPage } from './pages/PendingFixesPage';
import { RecordStubPage } from './pages/RecordStubPage';
import { TestDetailPage } from './pages/TestDetailPage';
import { TestListPage } from './pages/TestListPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { PendingFixesCountProvider } from './state/PendingFixesCountContext';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <PendingFixesCountProvider>
              <Layout />
            </PendingFixesCountProvider>
          }
        >
          <Route path="/" element={<TestListPage />} />
          <Route path="/tests/:id" element={<TestDetailPage />} />
          <Route path="/pending-fixes" element={<PendingFixesPage />} />
          <Route path="/record" element={<RecordStubPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
