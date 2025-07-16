import { Link } from "react-router-dom";
const MobileNavbar = () => {
    return (
        <div style={{
            width: '100%',
            backgroundColor: '#1f1f1f',
            color: '#EBF1D5',
            padding: '1rem',
            position: 'fixed',
            bottom: 0,
            left: 0,
            zIndex: 10,
            flex: 1,
            flexDirection: 'row',
            gap: 5
        }}>
            <div className='flex flex-row justify-between'>
                <Link to="/friends" className="hover:text-teal-300">Friends</Link>
                <Link to="/groups" className="hover:text-teal-300">Groups</Link>
                <Link to="/add-expense" className="hover:text-teal-300">Add Expense</Link>
                <Link to="/account" className="hover:text-teal-300">Account</Link>

            </div>
        </div>
    );
};

export default MobileNavbar;
