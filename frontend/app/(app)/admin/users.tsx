import { Guard } from "../../../src/components/layout/Shell";
import { P } from "../../../src/constants/access";
import UsersScreen from "../../../src/features/admin/UsersScreen";
export default function Screen() {
  return <Guard permissions={[P.usersManage]}><UsersScreen /></Guard>;
}
