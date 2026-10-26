import { Require } from "../../../src/components/layout/Shell";
import MyProvidersScreen from "../../../src/features/services/ProvidersScreen";
// Same gate as GET /services/providers/mine.
export default function Screen() {
  return (
    <Require permissions={["services.manage", "services.admin"]}>
      <MyProvidersScreen />
    </Require>
  );
}
