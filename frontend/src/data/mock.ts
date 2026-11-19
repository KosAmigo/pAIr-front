// 모든 데이터는 목업이다. API 호출 없음.

// 역량 6개와 배점 (rubric_items, 2026-11-12: 재현성을 빼고 문제 분해력·위임 판단력 추가)
export type CompetencyKey = 'usage' | 'control' | 'decomposition' | 'delegation' | 'delivery' | 'potential'

// DESIGN.md §1.4 — 고정 순서, 고정 색 (프로그래머스 AI 역량평가에서 AI 기초 이해력을 뺀 5개 항목)
export const COMPETENCIES: { key: CompetencyKey; name: string; max: number; color: string }[] = [
  { key: 'usage', name: 'AI 활용력', max: 20, color: 'var(--color-branch-2)' },
  { key: 'control', name: 'AI 통제력', max: 15, color: 'var(--color-branch-3)' },
  { key: 'decomposition', name: '문제 분해력', max: 10, color: 'var(--color-branch-4)' },
  { key: 'delegation', name: '위임 판단력', max: 10, color: 'var(--color-comp-7)' },
  { key: 'delivery', name: 'AI 결과 도출력', max: 30, color: 'var(--color-branch-5)' },
  { key: 'potential', name: '성과 잠재력', max: 15, color: 'var(--color-comp-6)' },
]

export type Scores = Record<CompetencyKey, number>

export const user = { name: '김지원', track: '개발' }

export const trend: { date: string; scores: Scores }[] = [
  { date: '10.28', scores: { usage: 15, control: 10, decomposition: 7, delegation: 7, delivery: 22, potential: 10 } },
  { date: '11.07', scores: { usage: 17, control: 10, decomposition: 8, delegation: 8, delivery: 23, potential: 10 } },
]

export const attempts = [
  { id: 'a-1107', date: '2026.11.07', task: '주문 API 장애 원인 분석', type: '개발', score: 76, replay: true },
  { id: 'a-1028', date: '2026.10.28', task: '신규 요금제 출시 기획안', type: '비개발', score: 71, replay: true },
  { id: 'a-1014', date: '2026.10.14', task: '정산 배치 서비스 리팩터링', type: '개발', score: 66, replay: true },
  { id: 'a-0930', date: '2026.09.30', task: '고객 VOC 분류 리포트', type: '비개발', score: 59, replay: true },
  { id: 'a-0916', date: '2026.09.16', task: '로그인 버그 재현과 수정', type: '개발', score: 57, replay: false },
]

export const recommended: Record<'개발' | '비개발', { title: string; focus: string; minutes: number; level: string }[]> = {
  개발: [
    { title: '결제 모듈 JUnit 테스트 작성', focus: '문제 분해력', minutes: 40, level: '중급' },
    { title: 'React 주문 목록 렌더링 개선', focus: 'AI 결과 도출력', minutes: 50, level: '중급' },
    { title: 'AI가 만든 JPA 쿼리 검수', focus: 'AI 통제력', minutes: 30, level: '초급' },
  ],
  비개발: [
    { title: '경쟁사 리서치 요약 검증', focus: 'AI 통제력', minutes: 35, level: '초급' },
    { title: '분기 매출 데이터 해석 보고서', focus: 'AI 결과 도출력', minutes: 45, level: '중급' },
    { title: '고객 응대 매뉴얼 개선안', focus: 'AI 활용력', minutes: 40, level: '초급' },
  ],
}

// ───────── 응시 화면 ─────────
// 개발 과제는 Spring Boot(백엔드) + React(프론트엔드) 기준
export const task = {
  id: 't-order-api',
  title: '주문 API 장애 원인 분석',
  type: '개발',
  minutes: 60,
  description: [
    '어제 21시부터 주문 생성 API(POST /orders)의 응답 시간이 평소보다 8배 늘고, 일부 요청이 500 오류로 끝나고 있습니다.',
    '백엔드는 Spring Boot, 프론트엔드는 React로 작성되어 있습니다. 제공된 코드와 로그를 살펴보고, 내장 AI를 활용해 원인을 찾아 수정하세요.',
  ],
  requirements: [
    '장애의 근본 원인을 찾아 코드로 수정한다.',
    '수정이 올바른지 확인할 수 있는 JUnit 테스트를 1개 이상 추가한다.',
    'NOTES.md에 원인과 판단 근거를 3줄 이내로 정리한다.',
  ],
  notes: ['AI 답변을 그대로 믿지 말고 직접 검증하는 과정도 평가에 포함됩니다.', '외부 검색은 허용되지 않습니다.'],
}

export type FileNode = { name: string; type: 'file' | 'dir'; children?: FileNode[] }
export const files: FileNode[] = [
  {
    name: 'backend',
    type: 'dir',
    children: [
      {
        name: 'order',
        type: 'dir',
        children: [
          { name: 'OrderController.java', type: 'file' },
          { name: 'OrderService.java', type: 'file' },
        ],
      },
      {
        name: 'inventory',
        type: 'dir',
        children: [
          { name: 'InventoryService.java', type: 'file' },
          { name: 'StockRepository.java', type: 'file' },
        ],
      },
      { name: 'resources', type: 'dir', children: [{ name: 'application.yml', type: 'file' }] },
      { name: 'test', type: 'dir', children: [{ name: 'OrderServiceTest.java', type: 'file' }] },
    ],
  },
  { name: 'frontend', type: 'dir', children: [{ name: 'OrderPage.tsx', type: 'file' }] },
  { name: 'logs', type: 'dir', children: [{ name: 'api-2026-11-09.log', type: 'file' }] },
  { name: 'NOTES.md', type: 'file' },
]

export const fileContents: Record<string, string> = {
  'OrderService.java': `@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final InventoryService inventoryService;

    @Transactional
    public Order createOrder(Long userId, List<OrderItemRequest> items) {
        Order order = Order.create(userId);
        for (OrderItemRequest item : items) {
            // 상품마다 재고를 잠그고 차감한다
            inventoryService.reserve(item.productId(), item.quantity());
            order.addItem(item.productId(), item.quantity());
        }
        return orderRepository.save(order);
    }
}
`,
  'OrderController.java': `@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping
    public ResponseEntity<OrderResponse> create(@RequestBody CreateOrderRequest req) {
        Order order = orderService.createOrder(req.userId(), req.items());
        return ResponseEntity.ok(OrderResponse.from(order));
    }
}
`,
  'InventoryService.java': `@Service
@RequiredArgsConstructor
public class InventoryService {

    private final StockRepository stockRepository;

    public void reserve(Long productId, int quantity) {
        Stock stock = stockRepository.findByProductIdForUpdate(productId)
                .orElseThrow(() -> new StockNotFoundException(productId));
        if (stock.getCount() < quantity) {
            throw new OutOfStockException(productId);
        }
        stock.decrease(quantity);
    }
}
`,
  'StockRepository.java': `public interface StockRepository extends JpaRepository<Stock, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Stock s where s.productId = :productId")
    Optional<Stock> findByProductIdForUpdate(Long productId);
}
`,
  'application.yml': `spring:
  datasource:
    url: jdbc:mysql://db:3306/shop
    hikari:
      maximum-pool-size: 5
      connection-timeout: 3000
  jpa:
    properties:
      jakarta.persistence.lock.timeout: 3000
`,
  'OrderServiceTest.java': `@SpringBootTest
class OrderServiceTest {

    @Autowired
    OrderService orderService;

    @Test
    void createOrder_singleItem() {
        Order order = orderService.createOrder(1L, List.of(new OrderItemRequest(10L, 1)));
        assertThat(order.getTotalQuantity()).isEqualTo(1);
    }
}
`,
  'OrderPage.tsx': `export function OrderPage() {
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle')

  const submit = async (items: CartItem[]) => {
    setStatus('pending')
    const res = await fetch('/orders', { method: 'POST', body: JSON.stringify({ items }) })
    // 500 응답이면 재시도 안내를 띄운다
    setStatus(res.ok ? 'idle' : 'error')
  }

  return <OrderForm onSubmit={submit} status={status} />
}
`,
  'api-2026-11-09.log': `21:02:11 WARN  HikariPool-1 - Connection is not available, request timed out after 3000ms
21:02:14 ERROR POST /orders 500 CannotAcquireLockException
21:02:15 WARN  Lock wait timeout exceeded; try restarting transaction (stock.product_id=10)
`,
  'NOTES.md': `# 원인

# 판단 근거
`,
}

export const runOutput = [
  { kind: 'prompt', text: '$ ./gradlew test' },
  { kind: 'plain', text: '> Task :test' },
  { kind: 'ok', text: 'OrderServiceTest > createOrder_singleItem() PASSED' },
  { kind: 'err', text: 'OrderServiceTest > createOrder_concurrentReverseOrder() FAILED' },
  { kind: 'err', text: '    org.springframework.dao.CannotAcquireLockException at OrderServiceTest.java:41' },
  { kind: 'plain', text: '2 tests completed, 1 failed' },
] as const

export type ChatMsg = { turn: number; role: 'user' | 'ai'; time: string; text: string }
export const chat: ChatMsg[] = [
  { turn: 1, role: 'user', time: '00:03:12', text: '주문 API가 느려졌어. 로그에 HikariPool 커넥션 타임아웃이랑 lock wait timeout이 같이 나와. 코드는 OrderService.java, InventoryService.java야. 어디부터 보면 좋을까?' },
  { turn: 2, role: 'ai', time: '00:03:20', text: '두 경고가 함께 나온다면, 재고 행의 비관적 잠금(PESSIMISTIC_WRITE)이 트랜잭션 끝까지 유지되면서 커넥션이 반환되지 않는 상황을 먼저 의심해 볼 수 있어요. createOrder가 하나의 @Transactional 안에서 상품마다 잠금을 거는지 확인해 보세요.' },
  { turn: 3, role: 'user', time: '00:09:41', text: '맞아, 루프 전체가 한 트랜잭션이야. 그럼 상품 순서가 다른 주문 두 개가 동시에 오면 데드락도 날 수 있겠네?' },
  { turn: 4, role: 'ai', time: '00:09:50', text: '네, 가능합니다. 잠금 순서를 productId 기준으로 정렬하면 교착을 줄일 수 있어요. Hikari maximum-pool-size: 5도 동시 요청 대비 작아 보입니다.' },
  { turn: 5, role: 'user', time: '00:14:02', text: '풀 크기만 늘리면 증상만 가리는 거 아니야? 정렬 적용하고 동시성 테스트부터 써볼게.' },
]

// 비개발 과제 (track=biz) — DESIGN.md §6.9: 에디터 자리에 문서 편집기
export const bizTask = {
  id: 't-pricing-plan',
  title: '신규 요금제 출시 기획안',
  type: '비개발',
  minutes: 60,
  description: [
    '구독 서비스의 이탈률이 지난 분기 4.1%에서 6.8%로 올랐습니다. 경영진은 저가 요금제 출시를 검토하고 있습니다.',
    '제공된 자료와 내장 AI를 활용해, 저가 요금제 출시 여부에 대한 1페이지 기획안을 작성하세요.',
  ],
  requirements: [
    '출시 찬반 결론과 근거 3가지를 제시한다.',
    'AI가 제시한 수치는 제공 자료와 대조해 검증한다.',
    '예상 리스크와 대응 방안을 1개 이상 포함한다.',
  ],
  notes: ['AI 답변을 그대로 믿지 말고 직접 검증하는 과정도 평가에 포함됩니다.', '외부 검색은 허용되지 않습니다.'],
}
export const bizFiles: FileNode[] = [
  {
    name: '자료',
    type: 'dir',
    children: [
      { name: '이탈_설문_요약.md', type: 'file' },
      { name: '요금제별_매출.csv', type: 'file' },
    ],
  },
  { name: '기획안.md', type: 'file' },
]
export const bizDoc = `# 저가 요금제 출시 기획안

## 결론
저가 요금제 출시를 **조건부 찬성**한다.

## 근거
1. 이탈 사유 1위가 "가격 부담"(38%)이다.
2. `

export const followUps = [
  '커넥션 풀을 늘리는 대신 잠금 순서를 정렬하기로 한 이유는 무엇인가요?',
  'AI가 제안한 내용 중 직접 확인하지 않고 받아들인 부분이 있다면 무엇인가요?',
  '시간이 30분 더 있었다면 무엇을 추가로 검증했을까요?',
]

// ───────── 결과 리포트 ─────────
// 항목 점수는 배점 기준(감점식, 총점 100). 하위 기준: pAIr-docs/평가/재현성_AI결과도출력.md 의 AI 결과 도출력 부분
export type SubScore = { code: string; name: string; weight: number; score: number; note: string }
export const report = {
  id: 'a-1107',
  task: '주문 API 장애 원인 분석',
  date: '2026.11.07 14:20',
  duration: '00:52:18',
  total: 76,
  delta: 5,
  scores: [
    { key: 'usage', score: 17, note: '로그와 파일 위치를 함께 제공해 첫 답변의 정확도를 높였습니다.' },
    { key: 'control', score: 10, note: '커넥션 풀 증설 제안은 걸러냈지만, 정렬 코드는 검증 없이 적용했습니다.' },
    { key: 'decomposition', score: 8, note: '원인 확인, 재현 테스트, 수정 순서로 나눠 AI에게 맡겼습니다.' },
    { key: 'delegation', score: 8, note: '로그 해석은 AI에게 맡기고 잠금 순서 판단은 직접 했습니다.' },
    {
      key: 'delivery',
      score: 23,
      note: '필수 요구사항을 모두 충족했습니다. AI 정렬 코드를 그대로 붙인 부분이 감점됐습니다.',
      sub: [
        { code: 'D1', name: '요구사항 충족', weight: 35, score: 88, note: '숨은 테스트 8개 중 7개를 통과했습니다.' },
        { code: 'D2', name: '결과물 완성도', weight: 20, score: 76, note: '재고 부족 예외 처리 테스트가 없습니다.' },
        { code: 'D3', name: 'AI 산출물 통합력', weight: 20, score: 62, note: 'AI 정렬 코드를 수정 없이 붙여 넣었습니다(#T10).' },
        { code: 'D4', name: '도출 효율', weight: 15, score: 80, note: '첫 테스트 통과까지 41분으로, 응시자 상위 30%입니다.' },
        { code: 'D5', name: '결과 설명력', weight: 10, score: 85, note: '채택하지 않은 커넥션 풀 증설안과 그 이유를 설명했습니다.' },
      ],
    },
    { key: 'potential', score: 10, note: '테스트 실패 후 스스로 원인을 찾아 동시성 테스트로 마무리했습니다.' },
  ] as { key: CompetencyKey; score: number; note: string; sub?: SubScore[] }[],
}

export const timelineEvents: { t: number; kind: 'run' | 'ai' | 'save' }[] = [
  { t: 3, kind: 'ai' }, { t: 4, kind: 'ai' }, { t: 7, kind: 'save' }, { t: 9, kind: 'ai' }, { t: 10, kind: 'ai' },
  { t: 14, kind: 'ai' }, { t: 16, kind: 'save' }, { t: 18, kind: 'run' }, { t: 21, kind: 'run' }, { t: 23, kind: 'ai' },
  { t: 24, kind: 'ai' }, { t: 27, kind: 'save' }, { t: 29, kind: 'run' }, { t: 33, kind: 'ai' }, { t: 35, kind: 'run' },
  { t: 38, kind: 'save' }, { t: 41, kind: 'ai' }, { t: 42, kind: 'run' }, { t: 46, kind: 'save' }, { t: 49, kind: 'run' },
  { t: 51, kind: 'save' },
]
// 분당 AI 상호작용 밀도 (0~1)
export const density = Array.from({ length: 53 }, (_, i) => {
  const peaks = [3, 9, 14, 23, 33, 41]
  const v = peaks.reduce((a, p) => a + Math.exp(-((i - p) ** 2) / 4), 0)
  return Math.min(1, v * 0.85 + 0.05)
})

export type Moment = {
  id: string
  t: number
  time: string
  tone: 'good' | 'weak'
  title: string
  competency: CompetencyKey
  explain: string
  quotes: ChatMsg[]
  snapshot: string[]
}
export const moments: Moment[] = [
  {
    id: 'm1',
    t: 3,
    time: '00:03:12',
    tone: 'good',
    title: '로그 두 줄을 함께 제공',
    competency: 'usage',
    explain: '서로 다른 두 경고를 함께 전달해, AI가 원인을 "잠금 + 커넥션 고갈"로 좁힐 수 있었습니다. 첫 질문에서 파일 위치까지 밝힌 점이 효과적이었습니다.',
    quotes: [chat[0], chat[1]],
    snapshot: ['열린 파일: logs/api-2026-11-09.log', '수정된 파일 없음', 'AI 대화 2턴'],
  },
  {
    id: 'm2',
    t: 14,
    time: '00:14:02',
    tone: 'good',
    title: '커넥션 풀 증설 제안을 보류',
    competency: 'control',
    explain: 'AI가 함께 제시한 커넥션 풀(maximum-pool-size) 증설을 "증상 완화"로 구분하고, 근본 원인인 잠금 순서부터 다루기로 했습니다. 이 결정이 이후 풀이 방향을 정했습니다.',
    quotes: [chat[3], chat[4]],
    snapshot: ['열린 파일: OrderService.java', '수정 1건 (OrderService.java)', 'AI 대화 5턴'],
  },
  {
    id: 'm3',
    t: 23,
    time: '00:23:41',
    tone: 'weak',
    title: 'AI 정렬 코드를 검증 없이 적용',
    competency: 'delivery',
    explain: 'AI가 제안한 items.sort(Comparator.comparing(…)) 코드를 그대로 붙여 넣었습니다. 같은 상품이 두 번 들어오는 경우를 확인하지 않아, 이후 테스트 실패 원인을 찾는 데 8분이 더 걸렸습니다.',
    quotes: [
      { turn: 9, role: 'user', time: '00:23:10', text: '정렬하는 코드 짜줘. 그대로 붙일게.' },
      { turn: 10, role: 'ai', time: '00:23:18', text: '루프 전에 items.sort(Comparator.comparing(OrderItemRequest::productId)); 를 추가하면 됩니다.' },
    ],
    snapshot: ['열린 파일: OrderService.java', '수정 2건', '테스트 1개 실패 중'],
  },
  {
    id: 'm4',
    t: 41,
    time: '00:41:05',
    tone: 'good',
    title: '동시성 테스트로 수정 확인',
    competency: 'control',
    explain: '스레드 두 개로 역순 주문을 동시에 넣는 테스트를 직접 설계해, 교착이 사라졌음을 확인했습니다.',
    quotes: [{ turn: 15, role: 'user', time: '00:40:52', text: 'ExecutorService로 두 스레드에서 상품 순서를 반대로 넣는 테스트 구조만 봐줘. 검증 로직은 내가 쓸게.' }],
    snapshot: ['열린 파일: OrderServiceTest.java', '수정 4건', '테스트 2/2 통과'],
  },
]

// ───────── 복기 트리 ─────────
export type TreeNode = {
  id: string
  branch: number // 0-based index → branch-(n+1)
  row: number
  time: string
  label: string
  kind: 'checkpoint' | 'fork' | 'submit'
  score?: number
}
export type Branch = {
  id: string
  name: string
  parent?: number
  forkFromRow?: number
  total: number
  scores: Scores
  summary: string[]
}

export const branches: Branch[] = [
  {
    id: 'main',
    name: 'main',
    total: 76,
    scores: { usage: 17, control: 10, decomposition: 8, delegation: 8, delivery: 23, potential: 10 },
    summary: ['AI 정렬 코드를 그대로 적용', '테스트 실패 후 8분 디버깅', '동시성 테스트로 최종 확인'],
  },
  {
    id: 'b2',
    name: 'b2',
    parent: 0,
    forkFromRow: 4,
    total: 84,
    scores: { usage: 17, control: 13, decomposition: 9, delegation: 8, delivery: 26, potential: 11 },
    summary: ['정렬 코드에 중복 상품 케이스를 직접 질문', '적용 전 단위 테스트 먼저 작성', '디버깅 없이 22분 단축'],
  },
  {
    id: 'b3',
    name: 'b3',
    parent: 0,
    forkFromRow: 2,
    total: 61,
    scores: { usage: 16, control: 7, decomposition: 6, delegation: 7, delivery: 17, potential: 8 },
    summary: ['커넥션 풀 증설안을 채택', '응답 시간은 개선됐으나 교착은 남음', '근본 원인 미해결로 제출'],
  },
  {
    id: 'b4',
    name: 'b4',
    parent: 1,
    forkFromRow: 7,
    total: 88,
    scores: { usage: 18, control: 13, decomposition: 9, delegation: 9, delivery: 27, potential: 12 },
    summary: ['b2에서 이어서 NOTES.md 근거 보강', '재고 부족 예외 테스트 추가', '최고 점수 분기'],
  },
]

export const treeNodes: TreeNode[] = [
  { id: 'n0', branch: 0, row: 0, time: '00:00:00', label: '응시 시작', kind: 'checkpoint' },
  { id: 'n1', branch: 0, row: 1, time: '00:03:12', label: '로그 두 줄과 함께 첫 질문', kind: 'checkpoint' },
  { id: 'n2', branch: 0, row: 2, time: '00:14:02', label: '커넥션 풀 증설 보류 결정', kind: 'checkpoint' },
  { id: 'n3', branch: 2, row: 3, time: '00:14:02', label: '커넥션 풀 증설 채택으로 분기', kind: 'fork' },
  { id: 'n4', branch: 0, row: 4, time: '00:23:41', label: 'AI 정렬 코드 적용', kind: 'checkpoint' },
  { id: 'n5', branch: 1, row: 5, time: '00:23:41', label: '중복 상품 케이스 질문으로 분기', kind: 'fork' },
  { id: 'n6', branch: 2, row: 6, time: '00:31:20', label: '응답 시간 개선 확인', kind: 'checkpoint' },
  { id: 'n7', branch: 1, row: 7, time: '00:29:05', label: '단위 테스트 먼저 작성', kind: 'checkpoint' },
  { id: 'n8', branch: 3, row: 8, time: '00:29:05', label: 'NOTES 근거 보강으로 분기', kind: 'fork' },
  { id: 'n9', branch: 0, row: 9, time: '00:41:05', label: '동시성 테스트로 확인', kind: 'checkpoint' },
  { id: 'n10', branch: 2, row: 10, time: '00:44:10', label: '제출', kind: 'submit', score: 61 },
  { id: 'n11', branch: 3, row: 11, time: '00:38:40', label: '재고 부족 예외 테스트 추가', kind: 'checkpoint' },
  { id: 'n12', branch: 1, row: 12, time: '00:36:12', label: '제출', kind: 'submit', score: 84 },
  { id: 'n13', branch: 0, row: 13, time: '00:52:18', label: '제출', kind: 'submit', score: 76 },
  { id: 'n14', branch: 3, row: 14, time: '00:47:30', label: '제출', kind: 'submit', score: 88 },
]

// ───────── 시험 입장 ─────────
export const examInfo = {
  company: '(주)넥스트커머스',
  title: '2026 하반기 신입 개발자 AI 활용 역량평가',
  start: '2026.11.10 15:00',
  duration: '60분',
  tasks: '과제 2개 (자유롭게 오가며 풀기) + 과제마다 후속 질문',
  /** 회차 과제 (응시 화면 LIVE_TASKS 와 같은 순서) */
  taskTitles: [task.title, bizTask.title],
  proctor: '카메라, 화면 공유, 브라우저 이탈 감지',
  /** 응시자는 기업이 등록한 이름과 이메일로만 구분한다 (exam_participants). 수험번호는 없다 */
  applicant: { name: '김지원', email: 'jiwon.kim@example.com' },
}
