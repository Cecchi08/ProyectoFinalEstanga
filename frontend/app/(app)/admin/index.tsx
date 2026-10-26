import { Guard } from "../../../src/components/layout/Shell";
import { P } from "../../../src/constants/access";
import AdminScreen from "../../../src/features/admin/AdminScreen";
export default function Screen() {
  return <Guard permissions={[P.catalogsManage, P.usersManage, P.statisticsGlobal, P.concertsManageAll]}><AdminScreen /></Guard>;
}
