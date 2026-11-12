# 원인
주문이 몰릴 때 잠금 대기 시간 3초가 너무 짧아서 타임아웃이 났다.

# 판단 근거
로그에 LockTimeoutException이 3초 뒤에 찍혀 있어서 타임아웃을 10초로 늘리고 createOrder를 synchronized로 막았다.
