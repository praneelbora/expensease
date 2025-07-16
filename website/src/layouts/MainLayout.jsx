import MobileNavbar from './MobileNavbar';
import SideNavbar from './SideNavbar';
import { isMobile } from 'react-device-detect';

const MainLayout = ({ children, groupId }) => {
    return (
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100dvh' }}>
            {!isMobile && <SideNavbar groupId={groupId}/>}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {isMobile && <MobileNavbar groupId={groupId}/>}
                <main style={{ paddingBlock: isMobile ? '2rem' : '2rem', paddingInline: isMobile ? '1.5rem' : '1.5rem', paddingBottom: isMobile ? '80px' : '2rem', height: '100%' }}>{children}</main>
            </div>
        </div>
    );
};

export default MainLayout;
