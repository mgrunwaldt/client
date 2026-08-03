import MenuFooter from "./menu-footer";
import MenuNav from "./menu-nav";

export default function HomeMenu() {
  return (
    <div className="!z-100 relative flex h-full w-full flex-col items-center justify-center">
      <MenuNav />
      <MenuFooter />
    </div>
  );
}
