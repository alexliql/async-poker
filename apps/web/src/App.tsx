import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Create } from './screens/Create';
import { Demo } from './screens/Demo';
import { DeviceClaim } from './screens/DeviceClaim';
import { NotFound } from './screens/Message';
import { TableRoute } from './screens/TableRoute';

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Create />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/t/:slug" element={<TableRoute />} />
        <Route path="/t/:slug/device/:code" element={<DeviceClaim />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
