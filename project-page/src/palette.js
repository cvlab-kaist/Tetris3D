export const palette = ['#a1bfd5', '#d7a998', '#b4c3aa', '#baa3d9', '#d9bf8c', '#a0c6bf'];
export const isPrimitive = (id) => id.startsWith('context');
export const objectColor = (id, index) => isPrimitive(id) ? '#b7bac5' : id === 'target' ? '#bba0d9' : palette[index % palette.length];
