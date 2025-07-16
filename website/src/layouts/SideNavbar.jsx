import { Link } from "react-router-dom";

const SideNavbar = () => {
    return (
        <div style={{
            width: '80px',
            backgroundColor: '#1f1f1f',
            color: '#EBF1D5',
            padding: '1rem',
            height: '100vh'
        }} className='flex items-center justify-center'>
            <div className='h-fit flex flex-col justify-around gap-8'>
                <Link to="/friends" className="hover:text-teal-300">Friends</Link>
                <Link to="/groups" className="hover:text-teal-300">Groups</Link>
                <Link to="/add-expense" className="hover:text-teal-300">Add Expense</Link>
                <Link to="/account" className="hover:text-teal-300">Account</Link>

            </div>
        </div>
    );
};

export default SideNavbar;
