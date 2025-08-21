import MobileNavbar from './MobileNavbar';
import SideNavbar from './SideNavbar';
import { isMobile } from 'react-device-detect';
import WhatsNew from "../components/WhatsNew";
import { useLocation } from 'react-router';
const MainLayout = ({ children, groupId }) => {
    const location = useLocation()
    const showWhatsNew = [
        /^\/new-expense\/?$/,
        /^\/account\/?$/,
        /^\/new-loan\/?$/,
        /^\/dashboard\/?$/,
        /^\/friends\/?$/,
        /^\/groups\/?$/
    ].some(re => re.test(location.pathname || '/'));
    return (
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100dvh' }}>
            {!isMobile && <SideNavbar groupId={groupId} />}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {isMobile && <MobileNavbar groupId={groupId} />}
                {showWhatsNew && <WhatsNew variant="fab" />}
                <main
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        paddingTop: isMobile ? '20px' : '1.5rem',
                        // paddingInline: isMobile ? '20px' : '1rem',
                        paddingBottom: isMobile ? '80px' : '1rem',
                        overflow: 'hidden', // Prevent main from scrolling
                    }}
                >
                    {/* Children should now scroll inside this */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
