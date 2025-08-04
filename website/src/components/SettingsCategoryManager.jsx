import { useContext, useEffect, useState } from 'react';
import { getUserCategories, saveUserCategories } from '../services/UserService';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { ArrowUpDown, X } from 'lucide-react';
import { HTML5Backend } from 'react-dnd-html5-backend';
import React, { useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const DraggableCategory = ({ category, index, moveCategory, removeCategory }) => {
    const ref = useRef(null);
    const dragRef = useRef(null);

    const [, drag] = useDrag({
        type: 'CATEGORY',
        item: { index },
    });

    const [, drop] = useDrop({
        accept: 'CATEGORY',
        hover: (draggedItem) => {
            if (draggedItem.index !== index) {
                moveCategory(draggedItem.index, index);
                draggedItem.index = index;
            }
        },
    });

    drop(ref);
    drag(dragRef);

    return (
        <div
            ref={ref}
            className="flex justify-between items-center mb-2 gap-2"
            style={{ touchAction: 'none' }}
        >
            <div className="flex flex-1 justify-between items-center gap-2 bg-[#2A2A2A] py-1 px-2 rounded">
                <span className="select-none touch-none">{category.emoji} {category.name}</span>
                <button
                    ref={dragRef}
                    className="cursor-grab active:cursor-grabbing text-white hover:opacity-80 px-2 py-1"
                    style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                >
                    <ArrowUpDown size={20} />
                </button>
            </div>
            <button onClick={() => removeCategory(index)} className="text-red-400">
                <X />
            </button>
        </div>
    );
};

const arraysEqual = (a, b) => {
    if (a.length !== b.length) return false;
    return a.every((item, i) =>
        item.name === b[i].name &&
        item.emoji === b[i].emoji &&
        item.id === b[i].id
    );
};

const SettingsCategoryManager = ({ userToken }) => {
    const { categories, setCategories } = useAuth() || {};
    const [showEditor, setShowEditor] = useState(false);
    const [newCategories, setNewCategories] = useState(categories || []);
    const [newCategory, setNewCategory] = useState({ name: '', emoji: '' });

    useEffect(() => {
        setNewCategories(categories);
    }, [categories]);

    const moveCategory = (from, to) => {
        const updated = [...newCategories];
        const [moved] = updated.splice(from, 1);
        updated.splice(to, 0, moved);
        setNewCategories(updated);
    };

    const removeCategory = (index) => {
        setNewCategories(newCategories.filter((_, i) => i !== index));
    };

    const addCategory = () => {
        if (newCategory.name && newCategory.emoji) {
            setNewCategories([...newCategories, { ...newCategory, id: Date.now() }]);
            setNewCategory({ name: '', emoji: '' });
        }
    };

    const handleSave = async () => {
        await saveUserCategories(newCategories, userToken);
        setCategories(newCategories);
        setShowEditor(false); // hide editor after saving
    };

    const handleUndo = () => {
        setNewCategories(categories);
    };

    const hasChanges = !arraysEqual(newCategories, categories);
    if (!categories) return null;

    return (
        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Customize Categories</h2>
                <button
                    className="bg-teal-600 px-3 py-1 rounded text-white text-sm"
                    onClick={() => setShowEditor(!showEditor)}
                >
                    {showEditor ? 'Close' : 'Edit'}
                </button>
            </div>
            {showEditor && (
                <p className="text-base text-[#BBBBBB] mt-2">
                    Changes you make here do not affect existing expenses. Long press and drag the icon to reorder categories. Don’t forget to click the ‘Save’ button to apply your changes.
                </p>
            )}


            {showEditor && (
                <div className='pt-4'>
                    <DndProvider backend={HTML5Backend}>
                        {newCategories.map((cat, index) => (
                            <DraggableCategory
                                key={`category${index}`}
                                index={index}
                                category={cat}
                                moveCategory={moveCategory}
                                removeCategory={removeCategory}
                            />
                        ))}
                    </DndProvider>

                    <p className="text-base text-[#BBBBBB] mt-4">
                        Add a custom category
                    </p>


                    <div className="flex items-center gap-2 mt-2">
                        <input
                            className="flex-2/3 bg-[#2A2A2A] text-white px-2 py-1 rounded w-1/2"
                            placeholder="Name"
                            value={newCategory.name}
                            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                        />
                        <input
                            className="flex-1/3 bg-[#2A2A2A] text-white px-2 py-1 rounded w-1/2"
                            placeholder="Emoji"
                            value={newCategory.emoji}
                            onChange={(e) => setNewCategory({ ...newCategory, emoji: e.target.value })}
                        />
                        <button onClick={addCategory} className="bg-teal-500 px-2 py-1 rounded text-sm">Add</button>
                    </div>

                    {hasChanges && (
                        <div className="flex flex-1 w-full gap-2 mt-4">
                            <button
                                onClick={handleUndo}
                                className="flex-1 bg-red-500 px-4 py-2 rounded text-white"
                            >
                                Undo all changes
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex-1 bg-teal-600 px-4 py-2 rounded text-white"
                            >
                                Save Changes
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SettingsCategoryManager;
