import { Guard } from "../../../src/components/layout/Shell";
import { P } from "../../../src/constants/access";
import AuditScreen from "../../../src/features/admin/AuditScreen";
export default function Screen() {
  return <Guard permissions={[P.usersManage]}><AuditScreen /></Guard>;
}
