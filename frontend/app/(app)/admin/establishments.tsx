import { Require } from "../../../src/components/layout/Shell";
import EstablishmentsReviewScreen from "../../../src/features/admin/EstablishmentsReviewScreen";
export default function Screen() {
  return (
    <Require permissions={["marketplace.admin"]}>
      <EstablishmentsReviewScreen />
    </Require>
  );
}
