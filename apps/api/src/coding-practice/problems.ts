// Draft content: a teacher must review it before public release.
// Solutions must run on Python 3.8.1, the version in Judge0 CE v1.13.1.
// ponytail: problems live in code; add the planned coding_problems tables when teachers need to author them.

export interface PracticeTest {
  stdin: string;
  expectedOutput: string;
  hidden: boolean;
}

export interface PracticeProblem {
  slug: string;
  title: string;
  level: string;
  summary: string;
  statement: string[];
  hints: string[];
  starterCode: string;
  tests: PracticeTest[];
}

const sample = (stdin: string, expectedOutput: string): PracticeTest => ({ stdin, expectedOutput, hidden: false });
const hidden = (stdin: string, expectedOutput: string): PracticeTest => ({ stdin, expectedOutput, hidden: true });

export const PROBLEMS: PracticeProblem[] = [
  {
    slug: 'loi-chao-dau-tien',
    title: 'Lời chào đầu tiên',
    level: 'Làm quen',
    summary: 'Viết chương trình biết chào bạn bằng tên.',
    statement: [
      'Máy tính sẽ cho em biết tên của một bạn. Hãy giúp máy tính chào bạn ấy thật lịch sự nhé!',
      'Chương trình cần in ra đúng một dòng theo mẫu: Xin chào, <tên>!',
    ],
    hints: [
      'Biến ten đã giữ tên của bạn ấy rồi. Em chỉ cần dùng lệnh print để in ra màn hình.',
      'Thử cách này: print("Xin chào, " + ten + "!")',
    ],
    starterCode: 'ten = input()\n\n# Viết code của em ở dưới dòng này\n',
    tests: [
      sample('An\n', 'Xin chào, An!\n'),
      sample('Minh Anh\n', 'Xin chào, Minh Anh!\n'),
      hidden('Bảo\n', 'Xin chào, Bảo!\n'),
      hidden('Ngọc Hân\n', 'Xin chào, Ngọc Hân!\n'),
    ],
  },
  {
    slug: 'tinh-tien-tra-sua',
    title: 'Tính tiền trà sữa',
    level: 'Làm quen',
    summary: 'Dùng phép nhân để tính số tiền cả nhóm phải trả.',
    statement: [
      'Nhóm của em đi uống trà sữa. Dòng đầu tiên là giá một ly, dòng thứ hai là số ly cả nhóm gọi.',
      'Hãy in ra tổng số tiền cả nhóm phải trả.',
    ],
    hints: [
      'input() luôn trả về chữ. Hãy dùng int(...) để đổi sang số trước khi tính.',
      'Tổng tiền bằng gia nhân so_ly: print(gia * so_ly)',
    ],
    starterCode: 'gia = int(input())\nso_ly = int(input())\n\n# Viết code của em ở dưới dòng này\n',
    tests: [
      sample('30000\n2\n', '60000\n'),
      sample('25000\n4\n', '100000\n'),
      hidden('45000\n1\n', '45000\n'),
      hidden('32000\n7\n', '224000\n'),
    ],
  },
  {
    slug: 'chan-hay-le',
    title: 'Chẵn hay lẻ?',
    level: 'Dễ',
    summary: 'Dùng câu lệnh if để máy tính biết tự quyết định.',
    statement: [
      'Cho một số nguyên. Hãy kiểm tra số đó là số chẵn hay số lẻ.',
      'In ra Chẵn nếu là số chẵn, in ra Lẻ nếu là số lẻ.',
    ],
    hints: [
      'Phép % cho biết số dư của phép chia. Một số chẵn chia cho 2 thì dư 0.',
      'Em có thể dùng: if so % 2 == 0: rồi thêm else: cho trường hợp còn lại. Nhớ thụt đầu dòng nhé.',
    ],
    starterCode: 'so = int(input())\n\n# Viết code của em ở dưới dòng này\n',
    tests: [
      sample('4\n', 'Chẵn\n'),
      sample('7\n', 'Lẻ\n'),
      hidden('0\n', 'Chẵn\n'),
      hidden('-3\n', 'Lẻ\n'),
      hidden('1000001\n', 'Lẻ\n'),
    ],
  },
  {
    slug: 'xay-bac-thang',
    title: 'Xây bậc thang',
    level: 'Dễ',
    summary: 'Dùng vòng lặp để vẽ một bậc thang bằng dấu sao.',
    statement: [
      'Cho số n là số bậc của cầu thang. Hãy vẽ cầu thang có n dòng bằng dấu *.',
      'Dòng thứ nhất có 1 dấu sao, dòng thứ hai có 2 dấu sao, cứ thế cho đến dòng thứ n.',
    ],
    hints: [
      'range(1, n + 1) cho em lần lượt các số từ 1 đến n.',
      'Trong Python, "*" * 3 sẽ tạo ra chuỗi ***. Hãy dùng phép này bên trong vòng lặp for.',
    ],
    starterCode: 'n = int(input())\n\n# Viết code của em ở dưới dòng này\n',
    tests: [
      sample('3\n', '*\n**\n***\n'),
      sample('1\n', '*\n'),
      hidden('5\n', '*\n**\n***\n****\n*****\n'),
      hidden('2\n', '*\n**\n'),
    ],
  },
  {
    slug: 'ban-cao-nhat-lop',
    title: 'Bạn cao nhất lớp',
    level: 'Thử thách',
    summary: 'Đọc nhiều số và tìm ra số lớn nhất.',
    statement: [
      'Dòng đầu tiên là số n, cho biết có bao nhiêu bạn. Mỗi dòng trong n dòng tiếp theo là chiều cao của một bạn, tính bằng xăng-ti-mét.',
      'Hãy in ra chiều cao lớn nhất.',
    ],
    hints: [
      'Dùng vòng lặp for để đọc từng chiều cao bằng int(input()).',
      'Tạo biến cao_nhat = 0. Mỗi lần đọc được số lớn hơn cao_nhat thì cập nhật lại biến này.',
    ],
    starterCode: 'n = int(input())\n\n# Viết code của em ở dưới dòng này\n',
    tests: [
      sample('3\n140\n152\n148\n', '152\n'),
      sample('1\n135\n', '135\n'),
      hidden('4\n160\n150\n155\n145\n', '160\n'),
      hidden('5\n130\n131\n132\n133\n134\n', '134\n'),
      hidden('3\n150\n150\n150\n', '150\n'),
    ],
  },
];
